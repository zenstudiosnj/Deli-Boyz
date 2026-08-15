import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { QRCodeCanvas } from 'qrcode.react';
import { db } from './firebase';
import type { UserProfile, Reward } from './types';
import { formatExpiry, getTier, pointsToNextTier } from './loyalty';
import { Crown, Ticket, QrCode, BadgeCheck } from 'lucide-react';

export default function ProfileDashboard({ user }: { user: User }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);

  useEffect(() => {
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) setProfile(snap.data() as UserProfile);
      },
      (err) => console.error('Profile load error:', err)
    );

    const q = query(collection(db, 'rewards'), where('userId', '==', user.uid));
    const unsubRewards = onSnapshot(
      q,
      (snap) => setRewards(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Reward)),
      (err) => console.error('Rewards load error:', err)
    );

    return () => { unsubProfile(); unsubRewards(); };
  }, [user.uid]);

  const points = profile?.points ?? 0;
  const tier = getTier(points);
  const toNext = pointsToNextTier(points);
  const activeRewards = rewards
    .filter(r => r.status === 'active' && r.expiresAt.toMillis() > Date.now())
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

  return (
    <div className="pt-20 pb-24 bg-[#0a0a0a] min-h-screen">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-6xl md:text-8xl font-display uppercase tracking-tighter text-white mb-16">
          Loyalty Club
        </h1>

        {/* Points + Tier card */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="border-4 border-black bg-white text-black p-8 shadow-[12px_12px_0px_0px_rgba(255,69,0,1)]">
            <div className="flex items-center gap-3 mb-6">
              <Crown size={32} className="text-[#ff4500]" />
              <h2 className="text-4xl font-display uppercase tracking-tighter">Your Points</h2>
            </div>
            <div className="text-8xl font-display tracking-tighter text-[#ff4500]">{points}</div>
            <p className="font-sans font-bold uppercase tracking-widest text-stone-500 mt-2">1 point per $1 spent</p>

            <div className="mt-8">
              <span className="inline-block px-4 py-1 font-display uppercase tracking-widest border-2 border-black"
                style={{ color: tier.color }}>
                {tier.name}
              </span>
              <div className="mt-4 h-4 border-2 border-black overflow-hidden bg-stone-100">
                <div className="h-full bg-[#ff4500] transition-all duration-500"
                  style={{
                    width: tier.next !== null
                      ? `${Math.min(100, ((points - tier.min) / (tier.next - tier.min)) * 100)}%`
                      : '100%',
                  }}
                />
              </div>
              <p className="mt-3 font-sans text-sm uppercase tracking-widest text-stone-500">
                {tier.next !== null
                  ? `${toNext} pts to ${getTier(tier.next).name}`
                  : 'Top tier — max status unlocked'}
              </p>
            </div>
          </div>

          {/* Personal loyalty QR */}
          <div className="border-4 border-black bg-white text-black p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-3 mb-6">
              <QrCode size={28} className="text-[#ff4500]" />
              <h2 className="text-3xl font-display uppercase tracking-tighter">Your Loyalty Code</h2>
            </div>
            <div className="bg-white border-4 border-black p-4">
              <QRCodeCanvas value={user.uid} size={200} bgColor="#ffffff" fgColor="#000000" />
            </div>
            <p className="mt-5 font-sans font-bold uppercase tracking-widest text-stone-500 text-sm">
              Show this at the register to earn points
            </p>
            <p className="mt-1 font-mono text-xs text-stone-400 break-all">{user.uid}</p>
          </div>
        </div>

        {/* Rewards */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <Ticket size={28} className="text-[#ff4500]" />
            <h2 className="text-4xl md:text-5xl font-display uppercase tracking-tighter text-white">
              Your Rewards
            </h2>
          </div>

          {activeRewards.length === 0 ? (
            <div className="border-4 border-stone-800 p-10 text-center">
              <BadgeCheck size={48} className="mx-auto text-stone-700 mb-4" />
              <p className="font-display uppercase text-2xl text-stone-500 tracking-wide">
                No active rewards yet
              </p>
              <p className="text-stone-600 mt-2 font-sans uppercase tracking-widest text-sm">
                Keep earning points — promotions land here
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              {activeRewards.map(r => (
                <div key={r.id} className="border-4 border-black bg-white text-black p-6 shadow-[10px_10px_0px_0px_rgba(255,69,0,1)]">
                  <div className="flex items-center gap-6">
                    <div className="bg-white border-4 border-black p-3 shrink-0">
                      <QRCodeCanvas value={r.qrCodeToken} size={120} bgColor="#ffffff" fgColor="#000000" />
                    </div>
                    <div>
                      <span className="inline-block px-3 py-1 bg-black text-white font-display uppercase text-xs tracking-widest mb-3">
                        Single Use
                      </span>
                      <h3 className="text-3xl font-display uppercase tracking-tighter">{r.title}</h3>
                      <p className="mt-2 font-sans uppercase tracking-widest text-sm text-stone-500">
                        Valid until {formatExpiry(r.expiresAt.seconds)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
