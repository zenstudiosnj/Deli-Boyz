import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast';
import { db } from './firebase';
import type { Reward, UserProfile } from './types';
import { generateRewardToken, getTier, isRewardToken } from './loyalty';
import { ScanLine, Camera, Ticket, X, UserRound, Plus } from 'lucide-react';

const SCANNER_ID = 'dbz-qr-reader';

interface IssuedReward {
  id: string;
  token: string;
  title: string;
  expires: string;
}

export default function CashierScanner({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'scan' | 'issue'>('scan');
  const [scanInput, setScanInput] = useState('');
  const [customer, setCustomer] = useState<UserProfile | null>(null);
  const [purchaseTotal, setPurchaseTotal] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);

  const [issueUid, setIssueUid] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDays, setIssueDays] = useState('30');
  const [issued, setIssued] = useState<IssuedReward | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const runningRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner && runningRef.current) {
      runningRef.current = false;
      try { await scanner.stop(); } catch { }
      try { scanner.clear(); } catch { }
      setCameraOn(false);
    }
  }, []);

  const startScanner = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner || runningRef.current) return;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        if (processingRef.current) return;
        processingRef.current = true;
        stopScanner().then(() => handleToken(decodedText));
      },
      () => {}
    ).then(() => {
      runningRef.current = true;
      setCameraOn(true);
    }).catch((err) => {
      console.warn('Camera start failed:', err);
      toast.error('Camera unavailable — use manual entry');
    });
  }, [stopScanner]);

  const handleTokenRef = useRef<(raw: string) => void>(() => {});
  handleTokenRef.current = async (raw: string) => {
    const token = (raw || '').trim();
    if (!token) return;
    processingRef.current = true;
    if (isRewardToken(token)) {
      await redeemReward(token);
    } else {
      await lookupCustomer(token);
    }
    processingRef.current = false;
    setTimeout(() => startScanner(), 1500);
  };

  const handleToken = (raw: string) => handleTokenRef.current(raw);

  useEffect(() => {
    scannerRef.current = new Html5Qrcode(SCANNER_ID, false);
    return () => {
      stopScanner();
      scannerRef.current = null;
    };
  }, [stopScanner]);

  useEffect(() => {
    if (tab === 'scan') startScanner();
    else stopScanner();
  }, [tab, startScanner, stopScanner]);

  const redeemReward = async (token: string) => {
    setBusy(true);
    try {
      const q = query(collection(db, 'rewards'), where('qrCodeToken', '==', token));
      const snap = await getDocs(q);
      if (snap.empty) {
        toast.error('No reward found for this code');
        return;
      }
      const rewardRef = doc(db, 'rewards', snap.docs[0].id);
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(rewardRef);
        if (!cur.exists()) throw new Error('Reward no longer exists');
        const data = cur.data();
        if (data.status === 'redeemed') throw new Error('This reward was already redeemed');
        if (data.expiresAt.toMillis() < Date.now()) throw new Error('This reward has expired');
        tx.update(rewardRef, { status: 'redeemed' });
      });
      const title = snap.docs[0].data().title as string;
      toast.success(`Reward redeemed: ${title}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redemption failed');
    } finally {
      setBusy(false);
    }
  };

  const lookupCustomer = async (uid: string) => {
    setBusy(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        setCustomer(null);
        toast.error('No customer found for this code');
        return;
      }
      const data = snap.data() as UserProfile;
      setCustomer(data);
      toast.success(`Customer found: ${data.displayName || data.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const creditPoints = async () => {
    if (!customer) {
      toast.error('Scan a customer first');
      return;
    }
    const total = parseFloat(purchaseTotal);
    if (isNaN(total) || total <= 0) {
      toast.error('Enter a valid purchase total');
      return;
    }
    const pts = Math.round(total);
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', customer.uid), { points: increment(pts) });
      toast.success(`Added ${pts} points to ${customer.displayName || customer.email}`);
      setPurchaseTotal('');
      const fresh = await getDoc(doc(db, 'users', customer.uid));
      if (fresh.exists()) setCustomer(fresh.data() as UserProfile);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add points');
    } finally {
      setBusy(false);
    }
  };

  const issueReward = async () => {
    const uid = issueUid.trim();
    const title = issueTitle.trim();
    const days = parseInt(issueDays, 10);
    if (!uid || !title) {
      toast.error('Enter a customer UID and reward title');
      return;
    }
    if (isNaN(days) || days <= 0) {
      toast.error('Enter a valid number of days');
      return;
    }
    const token = generateRewardToken();
    setBusy(true);
    try {
      const expires = new Date(Date.now() + days * 86400000);
      const ref = await addDoc(collection(db, 'rewards'), {
        userId: uid,
        title,
        qrCodeToken: token,
        status: 'active',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
      });
      setIssued({
        id: ref.id,
        token,
        title,
        expires: expires.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      });
      setIssueTitle('');
      toast.success('Reward issued!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to issue reward');
    } finally {
      setBusy(false);
    }
  };

  const tier = customer ? getTier(customer.points ?? 0) : null;

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] z-[120] overflow-y-auto text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-5xl md:text-6xl font-display uppercase tracking-tighter">
            Cashier <span className="text-[#ff4500]">Console</span>
          </h1>
          <button onClick={onClose} className="p-3 border-2 border-stone-700 hover:border-[#ff4500] hover:text-[#ff4500] transition-colors">
            <X size={28} />
          </button>
        </div>

        <div className="flex gap-2 mb-8 border-b border-stone-800">
          {([['scan', 'Scan / Credit', ScanLine], ['issue', 'Issue Reward', Ticket]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn2(
                "flex items-center gap-2 pb-4 px-5 font-display uppercase tracking-widest transition-all border-b-2",
                tab === key
                  ? "border-[#ff4500] text-[#ff4500]"
                  : "border-transparent text-stone-500 hover:text-white"
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        {tab === 'scan' && (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Scanner */}
            <div>
              <div className="border-4 border-black bg-black p-4 shadow-[10px_10px_0px_0px_rgba(255,69,0,1)]">
                <div id={SCANNER_ID} className="w-full aspect-square bg-stone-900 relative">
                  {!cameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-stone-500">
                      <Camera size={48} />
                      <button
                        onClick={startScanner}
                        className="bg-[#ff4500] text-black font-display uppercase px-6 py-3 border-2 border-black"
                      >
                        Start Camera
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 border-4 border-stone-800 p-5">
                <p className="font-display uppercase tracking-widest text-sm text-stone-500 mb-3">
                  Or type / scan optically
                </p>
                <div className="flex gap-3">
                  <input
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleToken(scanInput); setScanInput(''); } }}
                    placeholder="Paste UID or reward code"
                    className="flex-1 bg-black border-2 border-stone-700 p-4 font-mono text-sm outline-none focus:border-[#ff4500]"
                  />
                  <button
                    onClick={() => { handleToken(scanInput); setScanInput(''); }}
                    className="bg-white text-black px-6 font-display uppercase border-2 border-black hover:bg-[#ff4500]"
                  >
                    Scan
                  </button>
                </div>
              </div>
            </div>

            {/* Customer / credit panel */}
            <div>
              {customer ? (
                <div className="border-4 border-black bg-white text-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
                  <div className="flex items-center gap-3 mb-5">
                    <UserRound size={26} className="text-[#ff4500]" />
                    <h2 className="text-3xl font-display uppercase tracking-tighter">
                      {customer.displayName || customer.email}
                    </h2>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <span className="font-sans uppercase tracking-widest text-sm text-stone-500">Balance</span>
                    <span className="text-6xl font-display tracking-tighter text-[#ff4500]">
                      {customer.points ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="inline-block px-3 py-1 border-2 border-black font-display uppercase text-xs tracking-widest"
                      style={{ color: tier?.color }}>
                      {tier?.name}
                    </span>
                    <span className="font-mono text-xs text-stone-400 break-all">{customer.uid}</span>
                  </div>

                  <label className="block font-display uppercase tracking-widest text-sm mb-2">
                    Purchase Total ($)
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchaseTotal}
                      onChange={(e) => setPurchaseTotal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') creditPoints(); }}
                      placeholder="0.00"
                      className="flex-1 border-2 border-black p-4 font-mono text-xl outline-none focus:border-[#ff4500]"
                    />
                    <button
                      onClick={creditPoints}
                      disabled={busy}
                      className="flex items-center gap-2 bg-black text-white px-6 font-display uppercase border-2 border-black hover:bg-[#ff4500] hover:text-black disabled:opacity-50"
                    >
                      <Plus size={18} />
                      {busy ? '...' : 'Add'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs font-sans uppercase tracking-widest text-stone-500">
                    1 point per $1 · atomic Firestore increment
                  </p>
                </div>
              ) : (
                <div className="border-4 border-dashed border-stone-700 h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                  <ScanLine size={52} className="text-stone-600 mb-4" />
                  <p className="font-display uppercase text-2xl text-stone-500 tracking-wide">
                    Scan a customer's loyalty QR
                  </p>
                  <p className="text-stone-600 mt-2 font-sans uppercase tracking-widest text-sm">
                    or enter their UID above to load the credit panel
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'issue' && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-4 border-black bg-white text-black p-6 shadow-[10px_10px_0px_0px_rgba(255,69,0,1)]">
              <h2 className="text-3xl font-display uppercase tracking-tighter mb-6">Create Promotion</h2>
              <div className="space-y-5">
                <div>
                  <label className="block font-display uppercase tracking-widest text-sm mb-2">Customer UID</label>
                  <input
                    value={issueUid}
                    onChange={(e) => setIssueUid(e.target.value)}
                    placeholder="Paste customer UID"
                    className="w-full border-2 border-black p-4 font-mono text-sm outline-none focus:border-[#ff4500]"
                  />
                </div>
                <div>
                  <label className="block font-display uppercase tracking-widest text-sm mb-2">Reward Title</label>
                  <input
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="e.g. Free Jollof Rice"
                    className="w-full border-2 border-black p-4 font-display uppercase text-lg outline-none focus:border-[#ff4500]"
                  />
                </div>
                <div>
                  <label className="block font-display uppercase tracking-widest text-sm mb-2">Valid For (days)</label>
                  <input
                    type="number"
                    min="1"
                    value={issueDays}
                    onChange={(e) => setIssueDays(e.target.value)}
                    className="w-full border-2 border-black p-4 font-mono text-xl outline-none focus:border-[#ff4500]"
                  />
                </div>
                <button
                  onClick={issueReward}
                  disabled={busy}
                  className="w-full bg-black text-white py-5 font-display uppercase text-2xl border-2 border-black hover:bg-[#ff4500] hover:text-black disabled:opacity-50"
                >
                  {busy ? 'Issuing...' : 'Issue Single-Use Reward'}
                </button>
              </div>
            </div>

            <div className="border-4 border-black bg-white text-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center text-center">
              {issued ? (
                <>
                  <span className="inline-block px-3 py-1 bg-black text-white font-display uppercase text-xs tracking-widest mb-5">
                    Single Use · Valid Until {issued.expires}
                  </span>
                  <div className="bg-white border-4 border-black p-3">
                    <QRCodeCanvas value={issued.token} size={180} bgColor="#ffffff" fgColor="#000000" />
                  </div>
                  <h3 className="mt-5 text-3xl font-display uppercase tracking-tighter">{issued.title}</h3>
                  <p className="mt-1 font-mono text-xs text-stone-400 break-all">{issued.token}</p>
                  <p className="mt-4 font-sans uppercase tracking-widest text-sm text-stone-500">
                    Print or text this QR to the customer
                  </p>
                </>
              ) : (
                <div className="text-stone-400">
                  <Ticket size={52} className="mx-auto mb-4" />
                  <p className="font-display uppercase text-2xl tracking-wide">
                    Issue a reward to preview its QR
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function cn2(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}
