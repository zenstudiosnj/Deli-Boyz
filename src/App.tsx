import React, { useState, useEffect, lazy, Suspense } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';
import { db, auth } from './firebase';
import { MenuItem, Order, UserProfile, OrderItem } from './types';
import { ShoppingCart, User as UserIcon, LogOut, LayoutDashboard, Utensils, Clock, CheckCircle, XCircle, Plus, Minus, Trash2, ChevronRight, MapPin, Instagram, Phone, Crown, ScanLine } from 'lucide-react';
import { cn, formatPrice } from './utils';
import { Toaster, toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import ProfileDashboard from './ProfileDashboard';
const CashierScanner = lazy(() => import('./CashierScanner'));

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', errInfo);
  // Don't throw, just toast to keep the app alive
  if (errInfo.error.includes('insufficient permissions')) {
    console.warn('Permission denied for:', path);
  } else {
    toast.error(`Database error: ${errInfo.error}`);
  }
}

// --- Components ---

const AuthModal = ({ 
  isOpen, 
  onClose, 
  mode, 
  setMode, 
  email, 
  setEmail, 
  password, 
  setPassword, 
  onSubmit 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  mode: 'signin' | 'signup';
  setMode: (mode: 'signin' | 'signup') => void;
  email: string;
  setEmail: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 z-[100] backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-[110] border-4 border-black p-8 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] text-black"
        >
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-4xl font-display uppercase tracking-tighter">
              {mode === 'signin' ? 'Login' : 'Join Us'}
            </h2>
            <button onClick={onClose} className="hover:text-orange-600 transition-colors">
              <XCircle size={32} />
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block font-display text-xl uppercase mb-2">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border-4 border-black p-4 font-sans focus:bg-orange-50 outline-none transition-colors"
                placeholder="EMAIL@EXAMPLE.COM"
              />
            </div>
            <div>
              <label className="block font-display text-xl uppercase mb-2">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-4 border-black p-4 font-sans focus:bg-orange-50 outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-black text-white py-5 font-display text-2xl uppercase hover:bg-orange-600 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              {mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-stone-500 hover:text-black font-display uppercase tracking-widest text-sm underline decoration-2 underline-offset-4"
            >
              {mode === 'signin' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const ProfileModal = ({
  isOpen,
  onClose,
  user,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSave: (displayName: string) => Promise<void>;
}) => {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) setDisplayName(user.displayName || '');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(displayName);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 z-[100] backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white z-[110] border-4 border-black p-8 shadow-[16px_16px_0px_0px_rgba(234,88,12,1)] text-black"
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-4xl font-display uppercase tracking-tighter">Edit Profile</h2>
              <button onClick={onClose} className="hover:text-orange-600 transition-colors">
                <XCircle size={32} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block font-display text-xl uppercase mb-2">Email (Static)</label>
                <input 
                  type="text" 
                  disabled
                  value={user?.email || ''}
                  className="w-full border-4 border-black p-4 font-sans bg-stone-100 opacity-60"
                />
              </div>
              <div>
                <label className="block font-display text-xl uppercase mb-2">Display Name</label>
                <input 
                  type="text" 
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border-4 border-black p-4 font-sans focus:bg-orange-50 outline-none transition-colors"
                  placeholder="USERNAME"
                />
              </div>

              <button 
                type="submit"
                disabled={isSaving}
                className="w-full bg-black text-white py-5 font-display text-2xl uppercase hover:bg-orange-600 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const VerificationScreen = ({ 
  isOpen, 
  email, 
  onClose,
  onLoginClick,
  onCheckVerification
}: { 
  isOpen: boolean; 
  email: string;
  onClose: () => void;
  onLoginClick: () => void;
  onCheckVerification?: () => Promise<void>;
}) => {
  const [isChecking, setIsChecking] = useState(false);

  const handleCheck = async () => {
    if (!onCheckVerification) return;
    setIsChecking(true);
    try {
      await onCheckVerification();
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[150] backdrop-blur-md"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white z-[160] border-4 border-black p-12 text-center shadow-[16px_16px_0px_0px_rgba(234,88,12,1)] text-black"
          >
            <div className="flex justify-center mb-8 text-orange-600">
              <CheckCircle size={80} />
            </div>
            <h2 className="text-5xl font-display uppercase tracking-tighter mb-6">Verify Email</h2>
            <p className="text-2xl font-display uppercase tracking-tight mb-10 leading-tight">
              We have sent you a verification email to <span className="text-orange-600 break-all">{email}</span>. Please verify it, then log in to complete your profile setup.
            </p>
            
            <div className="space-y-4">
              <button 
                onClick={onLoginClick}
                className="w-full bg-black text-white py-6 font-display text-3xl uppercase hover:bg-orange-600 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
              >
                Login
              </button>

              {onCheckVerification && (
                <button 
                  onClick={handleCheck}
                  disabled={isChecking}
                  className="w-full border-4 border-black text-black py-4 font-display text-2xl uppercase hover:bg-stone-100 transition-all disabled:opacity-50"
                >
                  {isChecking ? 'Checking...' : 'Already Verified? Click Here'}
                </button>
              )}
              
              <button 
                onClick={onClose}
                className="block w-full text-stone-500 hover:text-black font-display uppercase tracking-widest text-sm underline decoration-2 underline-offset-4"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const LocationModal = ({ 
  isOpen, 
  onClose, 
  onSelect 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSelect: (location: string) => void;
}) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 z-[200] backdrop-blur-md"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white z-[210] border-4 border-black p-8 md:p-12 shadow-[16px_16px_0px_0px_rgba(234,88,12,1)] text-black"
        >
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-4xl md:text-5xl font-display uppercase tracking-tighter text-black">Select Location</h2>
            <button onClick={onClose} className="hover:text-orange-600 transition-colors text-black">
              <XCircle size={40} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <button 
              onClick={() => onSelect('HARLEM')}
              className="group p-8 border-4 border-black text-left hover:bg-orange-600 transition-all flex flex-col gap-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
            >
              <h3 className="text-3xl font-display uppercase text-black group-hover:text-white">Harlem</h3>
              <p className="font-sans font-bold text-sm uppercase tracking-widest text-stone-500 group-hover:text-white/80">
                2275 Adam Clayton Powell Jr Blvd, New York 10030
              </p>
              <div className="mt-4 flex items-center gap-2 font-display text-xl uppercase text-black group-hover:text-white underline decoration-2 underline-offset-4">
                Pick this location <ChevronRight size={20} />
              </div>
            </button>

            <button 
              onClick={() => onSelect('BRONX')}
              className="group p-8 border-4 border-black text-left hover:bg-orange-600 transition-all flex flex-col gap-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]"
            >
              <h3 className="text-3xl font-display uppercase text-black group-hover:text-white">Bronx</h3>
              <p className="font-sans font-bold text-sm uppercase tracking-widest text-stone-500 group-hover:text-white/80">
                288 E Burnside Ave, Bronx New York 10457
              </p>
              <div className="mt-4 flex items-center gap-2 font-display text-xl uppercase text-black group-hover:text-white underline decoration-2 underline-offset-4">
                Pick this location <ChevronRight size={20} />
              </div>
            </button>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const LocationsSection = () => {
  const locations = [
    { name: 'HARLEM', address: '2275 Adam Clayton Powell Jr Blvd, New York, NY 10030', phone: '(646) 692-3071', hours: 'TUE-SUN 1PM-5AM | CLOSED MON' },
    { name: 'BRONX (New Location)', address: '288 E Burnside Ave, Bronx, NY 10457', phone: '(917) 471-8303', hours: '7 Days 1PM-12AM' },
  ];

  return (
    <section id="locations" className="py-24 bg-white border-t-4 border-black relative overflow-hidden text-black">
      <div className="urban-texture top-1/4 right-10 text-5xl opacity-5 -rotate-6 text-black">DELI BOYZ</div>
      <div className="max-w-[1400px] mx-auto px-4 relative z-10">
        <h2 className="text-6xl md:text-8xl font-display uppercase tracking-tighter mb-16 marker-highlight inline-block">Locations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-black">
          {locations.map((loc, i) => (
            <div key={i} className={`p-12 flex flex-col gap-6 hover:bg-orange-600 hover:text-white transition-all group ${i !== locations.length - 1 ? 'md:border-r-4 border-black' : ''} ${i !== 0 ? 'border-t-4 md:border-t-0 border-black' : ''}`}>
              <h3 className="text-4xl font-display uppercase leading-none">{loc.name}</h3>
              <div className="space-y-2">
                <p className="text-xl font-medium uppercase">{loc.address}</p>
                <p className="text-xl font-medium uppercase">{loc.phone}</p>
              </div>
              <div className="mt-auto pt-8">
                <span className="bg-black text-white px-4 py-2 font-display text-xl uppercase group-hover:bg-white group-hover:text-black transition-all">
                  {loc.hours}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const HistorySection = () => {
  return (
    <section id="history" className="py-24 bg-orange-600 text-white border-t-4 border-black relative overflow-hidden">
      <div className="urban-texture top-10 right-20 text-6xl opacity-10 rotate-12 text-black">TRADITION</div>
      <div className="urban-texture bottom-20 left-10 text-4xl opacity-10 -rotate-12 text-black">EST. HARLEM</div>
      <div className="max-w-[1400px] mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-6xl md:text-8xl font-display uppercase tracking-tighter mb-8 leading-[0.8]">The<br/>Story</h2>
            <div className="space-y-6 text-2xl font-medium uppercase leading-tight max-w-xl">
              <p>Deli Boyz started in a small corner in Harlem with one goal: the perfect kebabs.</p>
              <p>No fancy ingredients. No gourmet prices. Just the real taste of the streets, served fresh to the people who keep this city moving.</p>
              <p>From Harlem to the Bronx, we're bringing the NYC original to every block.</p>
            </div>
          </div>
          <div className="relative">
            <div className="border-8 border-black shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1544148103-0773bf10d330?q=80&w=1200&auto=format&fit=crop" 
                alt="Deli Boyz Flame-Grilled Chicken Kebabs" 
                className="w-full h-full object-cover grayscale contrast-125"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const Navbar = ({ 
  user, 
  isAdmin, 
  onLogin, 
  onLogout, 
  cartCount, 
  onOpenCart,
  onOpenAdmin,
  onOpenCashier,
  onOpenLoyalty,
  onOpenProfile,
  onOpenMenu,
  onGoHome
}: { 
  user: User | null; 
  isAdmin: boolean; 
  onLogin: () => void; 
  onLogout: () => void; 
  cartCount: number;
  onOpenCart: () => void;
  onOpenAdmin: () => void;
  onOpenCashier: () => void;
  onOpenLoyalty: () => void;
  onOpenProfile: () => void;
  onOpenMenu: () => void;
  onGoHome: () => void;
}) => (
  <nav className="sticky top-0 z-50 bg-white border-b-4 border-black text-black">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
      <div className="flex justify-between h-20 items-center">
        <div className="flex items-center gap-8">
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={onGoHome}
          >
            <span className="text-3xl font-display uppercase tracking-tighter text-black">DELI BOYZ</span>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <button onClick={onOpenMenu} className="font-display text-lg uppercase hover:text-orange-600 transition-colors">Menu</button>
            <button onClick={() => document.getElementById('locations')?.scrollIntoView({ behavior: 'smooth' })} className="font-display text-lg uppercase hover:text-orange-600 transition-colors">Locations</button>
            <button onClick={() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })} className="font-display text-lg uppercase hover:text-orange-600 transition-colors">History</button>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {user && (
            <button
              onClick={onOpenLoyalty}
              className="flex items-center gap-2 p-2 text-black hover:text-[#ff4500] transition-colors font-display uppercase text-sm tracking-widest"
              title="Loyalty Club"
            >
              <Crown size={24} />
              <span className="hidden lg:inline">Loyalty</span>
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={onOpenCashier}
                className="flex items-center gap-2 p-2 text-black hover:text-[#ff4500] transition-colors font-display uppercase text-sm tracking-widest"
                title="Cashier Console"
              >
                <ScanLine size={24} />
                <span className="hidden lg:inline">Cashier</span>
              </button>
              <button
                onClick={onOpenAdmin}
                className="p-2 text-black hover:text-orange-600 transition-colors"
                title="Admin Dashboard"
              >
                <LayoutDashboard size={24} />
              </button>
            </>
          )}
          
          <button 
            onClick={onOpenCart}
            className="flex items-center gap-2 bg-orange-600 text-white px-6 py-2 rounded-none border-2 border-black font-display text-xl uppercase hover:bg-orange-700 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <ShoppingCart size={20} />
            <span>Cart ({cartCount})</span>
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div 
                onClick={onOpenProfile}
                className="w-10 h-10 rounded-none border-2 border-black bg-stone-100 flex items-center justify-center font-display text-xl uppercase overflow-hidden cursor-pointer hover:bg-orange-50 transition-colors"
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{user.email?.[0]}</span>
                )}
              </div>
              <button 
                onClick={onLogout}
                className="p-2 text-stone-500 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut size={24} />
              </button>
            </div>
          ) : (
            <button 
              onClick={onLogin}
              className="hidden sm:flex items-center gap-2 bg-black text-white px-6 py-2 rounded-none font-display text-xl uppercase hover:bg-stone-800 transition-all shadow-[4px_4px_0px_0px_rgba(234,88,12,1)]"
            >
              <UserIcon size={20} />
              Login / Join
            </button>
          )}
        </div>
      </div>
    </div>
  </nav>
);

const STATIC_MENU_ITEMS: MenuItem[] = [
  // Column 1: GRILL FAVORITES
  { id: '1', name: 'Baked Chicken', description: 'Slow-baked with house herbs.', price: 13.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '2', name: 'BBQ Chicken', description: 'Glazed with smoky NYC bbq sauce.', price: 13.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '3', name: 'Jerk Chicken', description: 'Authentic yard-style spicy jerk.', price: 13.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '4', name: 'Suya Lamb', description: 'West African spicy nut-rubbed lamb.', price: 30.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '5', name: 'Lamb Shoulder', description: 'Tender, slow-roasted lamb shoulder.', price: 20.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '6', name: 'Turkey Wings', description: 'Crispy and seasoned turkey wings.', price: 15.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '7', name: 'Steak', description: 'Premium cut, grilled to order.', price: 30.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '8', name: 'Guine Foul Chicken', description: 'Exotic roasted guine foul.', price: 20.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '9', name: 'Chicken Kebab', description: 'Flame-grilled poultry skewer.', price: 5.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },
  { id: '10', name: 'Beef Kebab', description: 'Tender seasoned beef skewer.', price: 5.00, category: 'GRILL FAVORITES', isAvailable: true, imageUrl: '' },

  // Column 2: FISH & STEWS and HANDHELDS
  { id: '11', name: 'Grilled Salmon', description: 'Fresh Atlantic salmon, lightly seasoned.', price: 20.00, category: 'FISH & STEWS', isAvailable: true, imageUrl: '' },
  { id: '12', name: 'Red Snapper', description: 'Whole snapper, grilled to perfection.', price: 20.00, category: 'FISH & STEWS', isAvailable: true, imageUrl: '' },
  { id: '13', name: 'Peanut Butter Stew', description: 'Rich and creamy savory peanut stew.', price: 12.00, category: 'FISH & STEWS', isAvailable: true, imageUrl: '' },
  { id: '14', name: 'Tomato Stew', description: 'Classic African tomato-based stew.', price: 12.00, category: 'FISH & STEWS', isAvailable: true, imageUrl: '' },
  { id: '15', name: 'Steak Sandwich', description: 'Shaved steak and melted cheese on hero.', price: 20.00, category: 'HANDHELDS', isAvailable: true, imageUrl: '' },
  { id: '16', name: 'Lamb Sandwich', description: 'Grilled lamb on a fresh hero roll.', price: 17.00, category: 'HANDHELDS', isAvailable: true, imageUrl: '' },
  { id: '17', name: 'Jerk Chicken Wrap', description: 'Spicy jerk chicken in a soft wrap.', price: 15.00, category: 'HANDHELDS', isAvailable: true, imageUrl: '' },
  { id: '18', name: 'Lamb Wrap', description: 'Seasoned lamb with fresh vegetables.', price: 20.00, category: 'HANDHELDS', isAvailable: true, imageUrl: '' },

  // Column 3: SIDES and STAPLES
  { id: '23', name: 'French Fries', description: 'Crispy golden fries.', price: 6.00, category: 'SAVORY SIDES', isAvailable: true, imageUrl: '' },
  { id: '25', name: 'Black-Eyed Peas', description: 'Traditional seasoned peas.', price: 8.00, category: 'SAVORY SIDES', isAvailable: true, imageUrl: '' },
  { id: '26', name: 'Sweet Plantains', description: 'Perfectly fried ripe plantains.', price: 8.00, category: 'SAVORY SIDES', isAvailable: true, imageUrl: '' },
  { id: '27', name: 'Lamb w/ Sweet Peas', description: 'Lamb stewed with tender peas.', price: 15.00, category: 'SAVORY SIDES', isAvailable: true, imageUrl: '' },
  
  { id: '19', name: 'Baked Ziti', description: 'Cheesy baked pasta classic.', price: 12.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '20', name: 'Mac & Cheese', description: 'Creamy five-cheese blend.', price: 8.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '21', name: 'Rasta Pasta', description: 'Jerk-seasoned creamy pasta.', price: 12.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '22', name: 'Meatless Pasta', description: 'Pasta with fresh vegetable sauce.', price: 10.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '24', name: 'Spaghetti w/ Lamb', description: 'Hearty lamb over pasta.', price: 15.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '28', name: 'Jollof Rice', description: 'Spicy one-pot African rice.', price: 10.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
  { id: '29', name: 'White Rice', description: 'Steamed fluffy white rice.', price: 6.00, category: 'PASTA & RICE', isAvailable: true, imageUrl: '' },
];

const MenuSection = ({ 
  items, 
  onAddToCart,
  viewOnly = false
}: { 
  items: MenuItem[]; 
  onAddToCart?: (item: MenuItem) => void;
  viewOnly?: boolean;
}) => {
  const col1Categories = ['GRILL FAVORITES'];
  const col2Categories = ['FISH & STEWS', 'HANDHELDS'];
  const col3Categories = ['SAVORY SIDES', 'PASTA & RICE'];

  const renderCategory = (category: string) => {
    const categoryItems = items.filter(i => i.category === category);
    if (categoryItems.length === 0) return null;

    return (
      <div key={category} className="mb-12 pl-0 py-2 relative group/category">
        <h2 className="text-3xl font-condensed font-bold uppercase tracking-widest text-[#FF4500] mb-8 subtle-orange-glow border-b border-[#FF4500] inline-block pb-1 text-left">
          {category}
        </h2>
        <div className="space-y-8">
          {categoryItems.map(item => (
            <div key={item.id} className="group/item">
              <div className="flex justify-between items-baseline mb-1 gap-4">
                <h3 className="text-xl font-condensed font-bold uppercase tracking-tight text-white">
                  {item.name}
                </h3>
                <span className={cn(
                  "text-lg font-condensed font-bold",
                  viewOnly ? "text-white" : "text-[#FF4500]"
                )}>
                  {formatPrice(item.price)}
                </span>
              </div>
              <p className="text-stone-500 font-sans text-sm leading-relaxed max-w-sm">
                {item.description}
              </p>
              {!viewOnly && onAddToCart && (
                <button 
                  onClick={() => onAddToCart(item)}
                  disabled={!item.isAvailable}
                  className={cn(
                    "mt-4 px-4 py-1.5 font-condensed font-bold text-sm uppercase tracking-[0.15em] border transition-all duration-300",
                    item.isAvailable 
                      ? "border-[#FF4500] text-[#FF4500] hover:bg-[#FF4500] hover:text-black active:translate-y-1" 
                      : "border-stone-800 text-stone-700 cursor-not-allowed"
                  )}
                >
                  {item.isAvailable ? '+ Add to Order' : 'Sold Out'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-black py-20 relative">
      <div className="grain-overlay opacity-5" />
      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-16 gap-y-16">
          {/* Column 1 */}
          <div className="space-y-2">
            {col1Categories.map(renderCategory)}
          </div>
          
          {/* Column 2 */}
          <div className="space-y-2">
            {col2Categories.map(renderCategory)}
          </div>

          {/* Column 3 */}
          <div className="space-y-2">
            {col3Categories.map(renderCategory)}
          </div>
        </div>
      </div>
    </div>
  );
};

const CartDrawer = ({ 
  isOpen, 
  onClose, 
  items, 
  onUpdateQty, 
  onRemove, 
  onCheckout,
  isCheckingOut
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  items: OrderItem[]; 
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  isCheckingOut: boolean;
}) => {
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[60]"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#0a0a0a] z-[70] border-l-4 border-black flex flex-col concrete-texture"
          >
            <div className="p-8 border-b-4 border-black flex justify-between items-center bg-black">
              <h2 className="text-4xl font-display uppercase tracking-tighter neon-orange-text">Your Order</h2>
              <button onClick={onClose} className="p-2 text-stone-500 hover:neon-orange-text transition-colors">
                <XCircle size={32} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                  <ShoppingCart size={64} className="text-stone-800" />
                  <p className="text-2xl font-display uppercase text-stone-600">Your cart is empty</p>
                  <button 
                    onClick={onClose}
                    className="bg-black text-[#ff4500] px-12 py-4 border-4 border-[#ff4500] font-display text-2xl uppercase neon-orange-box"
                  >
                    Start Ordering
                  </button>
                </div>
              ) : (
                items.map(item => (
                  <div key={item.id} className="flex gap-6 border-b-2 border-stone-900 pb-6">
                    <div className="flex-1">
                      <h4 className="text-2xl font-display uppercase text-white mb-1">{item.name}</h4>
                      <p className="neon-orange-text font-bold text-xl">{formatPrice(item.price)} each</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="flex items-center border-2 border-[#ff4500] neon-orange-box bg-black">
                        <button 
                          onClick={() => onUpdateQty(item.id, -1)}
                          className="p-2 text-white hover:bg-[#ff4500] hover:text-black transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-10 text-center font-display text-lg text-white">{item.quantity}</span>
                        <button 
                          onClick={() => onUpdateQty(item.id, 1)}
                          className="p-2 text-white hover:bg-[#ff4500] hover:text-black transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <button 
                        onClick={() => onRemove(item.id)}
                        className="text-stone-700 hover:text-red-600 uppercase text-xs font-bold tracking-widest"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {items.length > 0 && (
              <div className="p-8 border-t-8 border-black bg-black space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-display uppercase text-stone-500">Total</span>
                  <span className="text-5xl font-display neon-orange-text">{formatPrice(total)}</span>
                </div>
                <button 
                  onClick={onCheckout}
                  disabled={isCheckingOut}
                  className="w-full bg-black text-[#ff4500] py-6 border-4 border-[#ff4500] font-display text-3xl uppercase neon-orange-box active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50"
                >
                  {isCheckingOut ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-6 h-6 border-4 border-stone-800 border-t-[#ff4500] rounded-full animate-spin" />
                      Wait...
                    </div>
                  ) : 'Checkout Now'}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const AdminDashboard = ({ 
  orders, 
  menuItems, 
  onUpdateOrderStatus,
  onUpdatePaymentStatus,
  onClose 
}: { 
  orders: Order[]; 
  menuItems: MenuItem[];
  onUpdateOrderStatus: (id: string, status: Order['status']) => void;
  onUpdatePaymentStatus: (id: string, status: Order['paymentStatus']) => void;
  onClose: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-700',
    preparing: 'bg-blue-100 text-blue-700',
    ready: 'bg-green-100 text-green-700',
    completed: 'bg-stone-100 text-stone-700',
    cancelled: 'bg-red-100 text-red-700'
  };

  return (
    <div className="fixed inset-0 bg-stone-50 z-[100] overflow-y-auto text-black">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-stone-900">Admin Dashboard</h1>
          <button onClick={onClose} className="bg-stone-200 p-2 rounded-full hover:bg-stone-300 transition-colors">
            <XCircle size={24} />
          </button>
        </div>
        
        <div className="flex gap-4 mb-8 border-b border-stone-200">
          <button 
            onClick={() => setActiveTab('orders')}
            className={cn(
              "pb-4 px-4 font-bold transition-all border-b-2",
              activeTab === 'orders' ? "border-orange-600 text-orange-600" : "border-transparent text-stone-400"
            )}
          >
            Orders ({orders.length})
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={cn(
              "pb-4 px-4 font-bold transition-all border-b-2",
              activeTab === 'menu' ? "border-orange-600 text-orange-600" : "border-transparent text-stone-400"
            )}
          >
            Menu Management
          </button>
        </div>

        {activeTab === 'orders' ? (
          <div className="space-y-6">
            {orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(order => (
              <div key={order.id} className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
                <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-bold text-lg">Order #{order.id.slice(-4)}</span>
                      <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", statusColors[order.status])}>
                        {order.status}
                      </span>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                        order.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      )}>
                        {order.paymentStatus}
                      </span>
                    </div>
                    <p className="text-stone-500 text-sm">
                      {order.customerName} ({order.customerEmail}) • {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select 
                      value={order.status}
                      onChange={(e) => onUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                      className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="preparing">Preparing</option>
                      <option value="ready">Ready</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button 
                      onClick={() => onUpdatePaymentStatus(order.id, order.paymentStatus === 'paid' ? 'unpaid' : 'paid')}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                        order.paymentStatus === 'paid' ? "bg-stone-100 text-stone-600" : "bg-green-600 text-white"
                      )}
                    >
                      Mark as {order.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}
                    </button>
                  </div>
                </div>
                
                <div className="border-t border-stone-100 pt-4">
                  <ul className="space-y-2 mb-4">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="flex justify-between text-sm">
                        <span className="text-stone-700">
                          <span className="font-bold text-stone-900">{item.quantity}x</span> {item.name}
                        </span>
                        <span className="text-stone-500">{formatPrice(item.price * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between items-center pt-4 border-t border-stone-50">
                    <span className="font-bold text-stone-900">Total</span>
                    <span className="font-bold text-xl text-orange-600">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-6 py-4 font-bold text-stone-600 text-sm uppercase">Item</th>
                  <th className="px-6 py-4 font-bold text-stone-600 text-sm uppercase">Category</th>
                  <th className="px-6 py-4 font-bold text-stone-600 text-sm uppercase">Price</th>
                  <th className="px-6 py-4 font-bold text-stone-600 text-sm uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {menuItems.map(item => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <div className="font-bold text-stone-900">{item.name}</div>
                      <div className="text-stone-500 text-xs truncate max-w-xs">{item.description}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-stone-600">{item.category}</td>
                    <td className="px-6 py-4 font-bold text-stone-900">{formatPrice(item.price)}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                        item.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      )}>
                        {item.isAvailable ? 'Available' : 'Sold Out'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>(STATIC_MENU_ITEMS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isVerificationVisible, setIsVerificationVisible] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'menu' | 'loyalty'>('home');
  const [isCashierOpen, setIsCashierOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      // If user exists but isn't verified, we treat them as "not logged in" locally
      // to avoid background SDK conflicts.
      if (u && !u.emailVerified) {
        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      if (u && u.emailVerified) {
        setUser(u);
        const setupProfile = async (retryCount = 0) => {
          try {
            // Force refresh the token to ensure the 'email_verified' claim is captured in rules
            await u.getIdToken(true);
            
            // PROFILE SETUP: Use getDocFromServer to bypass cache and verify status
            const userDoc = await getDocFromServer(doc(db, 'users', u.uid));
            
            if (userDoc.exists()) {
              setIsAdmin(userDoc.data().role === 'admin');
            } else {
              console.log("Verified user logging in for first time. Setting up profile.");
              const isDefaultAdmin = u.email === 'zxymgmt@gmail.com';
              
              // Create the account in Firestore
              await setDoc(doc(db, 'users', u.uid), {
                uid: u.uid,
                email: u.email,
                role: isDefaultAdmin ? 'admin' : 'customer',
                displayName: u.displayName || u.email?.split('@')[0] || 'Deli Fan',
                points: 0,
                createdAt: serverTimestamp()
              });
              
              setIsAdmin(isDefaultAdmin);
              toast.success('Account created successfully!');
            }
          } catch (error) {
            console.error("Profile Setup Error:", error);
            if (error instanceof Error && error.message.includes('permission') && retryCount < 2) {
              console.warn(`Permission error, retrying setup (attempt ${retryCount + 1})...`);
              setTimeout(() => setupProfile(retryCount + 1), 1000);
              return;
            }
            // Fallback logic for admin even if DB check fails
            if (u.email === 'zxymgmt@gmail.com') {
              setIsAdmin(true);
            }
          }
        };
        setupProfile();
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'menuItems'), orderBy('category'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(items);
      
      // Seed initial data if empty and we are admin
      if (items.length === 0 && user?.email === 'zxymgmt@gmail.com') {
        seedInitialData();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'menuItems');
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ords);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });
    return unsubscribe;
  }, [isAdmin]);

  const seedInitialData = async () => {
    const initialMenu = [
      // Column 1: HOUSE GRILL FAVORITES (Part 1)
      { name: 'Baked Chicken', description: 'Oven-roasted to perfection with house blend spices.', price: 13.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/chicken1/800/800' },
      { name: 'BBQ Chicken', description: 'Smothered in our Signature Deli Boyz sweet and tangy BBQ sauce.', price: 13.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/bbq/800/800' },
      { name: 'Jerk Chicken', description: 'Authentic Jamaican-style jerk seasoning with a spicy kick.', price: 13.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/jerk/800/800' },
      { name: 'Chicken Kebab', description: 'Grilled chicken skewers seasoned with garlic and herbs.', price: 5.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/ckebab/800/800' },
      { name: 'Beef Kebab', description: 'Tender beef skewers with peppers and onions.', price: 5.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/bkebab/800/800' },
      { name: 'Grilled Salmon', description: 'Fresh salmon fillet grilled with lemon and dill.', price: 20.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/salmon/800/800' },
      { name: 'Red Snapper', description: 'Whole red snapper seasoned and grilled over open flame.', price: 20.00, category: 'HOUSE GRILL FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/snapper/800/800' },

      // Column 2: HOUSE GRILL & STEWS
      { name: 'Suya Lamb', description: 'Nigerian-style spicy skewered lamb with peanut spice.', price: 30.00, category: 'HOUSE GRILL (CONT.)', isAvailable: true, imageUrl: 'https://picsum.photos/seed/suya/800/800' },
      { name: 'Lamb Shoulder', description: 'Slow-grilled tender lamb shoulder.', price: 20.00, category: 'HOUSE GRILL (CONT.)', isAvailable: true, imageUrl: 'https://picsum.photos/seed/lshoulder/800/800' },
      { name: 'Turkey Wings', description: 'Jumbo turkey wings, seasoned and grilled.', price: 15.00, category: 'HOUSE GRILL (CONT.)', isAvailable: true, imageUrl: 'https://picsum.photos/seed/turkey/800/800' },
      { name: 'Steak', description: 'Grilled ribeye steak seasoned with sea salt and cracked pepper.', price: 30.00, category: 'HOUSE GRILL (CONT.)', isAvailable: true, imageUrl: 'https://picsum.photos/seed/steak/800/800' },
      { name: 'Guine Foul Chicken', description: 'Wild-caught guinea fowl, grilled with traditional spices.', price: 20.00, category: 'HOUSE GRILL (CONT.)', isAvailable: true, imageUrl: 'https://picsum.photos/seed/foul/800/800' },
      
      { name: 'Peanut Butter Stew (w/ Lamb)', description: 'Rich and creamy peanut base stew with tender lamb chunks. Small: $12.00 / Large: $20.00', price: 12.00, category: 'STEWS', isAvailable: true, imageUrl: 'https://picsum.photos/seed/peanut/800/800' },
      { name: 'Tomato Stew', description: 'Traditional African tomato-based stew. Small: $12.00 / Large: $20.00', price: 12.00, category: 'STEWS', isAvailable: true, imageUrl: 'https://picsum.photos/seed/tomato/800/800' },

      // Column 3: HANDHELDS & SIDES
      { name: 'Steak Sandwich', description: 'Shaved steak, melted cheese, grilled onions on a hero.', price: 20.00, category: 'HANDHELD FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/steaksand/800/800' },
      { name: 'Lamb Sandwich', description: 'Grilled lamb, house sauce, lettuce, tomato on a hero.', price: 17.00, category: 'HANDHELD FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/lambsand/800/800' },
      { name: 'Jerk Chicken Wrap', description: 'Spicy jerk chicken, vegetables, wrapped in a tortilla.', price: 15.00, category: 'HANDHELD FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/jerkwrap/800/800' },
      { name: 'Lamb Wrap', description: 'Seasoned lamb, fresh greens, house wrap sauce.', price: 20.00, category: 'HANDHELD FAVORITES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/lambwrap/800/800' },

      { name: 'Baked Ziti', description: 'Classic cheesy pasta bake.', price: 12.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/ziti/800/800' },
      { name: 'Mac & Cheese', description: 'Five-cheese baked macaroni.', price: 8.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/mac/800/800' },
      { name: 'Rasta Pasta', description: 'Creamy jerk-infused pasta with peppers.', price: 12.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/rasta/800/800' },
      { name: 'Meatless Pasta', description: 'Penne with fresh tomato and herb sauce.', price: 10.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/meatless/800/800' },
      { name: 'French Fries', description: 'Crispy golden fries.', price: 6.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/fries/800/800' },
      { name: 'Spaghetti w/ Lamb', description: 'Spaghetti tossed with tender lamb pieces.', price: 15.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/spag/800/800' },
      { name: 'Black-Eyed Peas', description: 'Slow-cooked seasoned peas.', price: 8.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/peas/800/800' },
      { name: 'Sweet Plantains', description: 'Fried ripe plantains.', price: 8.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/plantain/800/800' },
      { name: 'Lamb w/ Sweet Peas', description: 'Tender lamb stewed with sweet green peas.', price: 15.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/lambpeas/800/800' },
      { name: 'Jollof Rice', description: 'Spicy West African rice dish.', price: 10.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/jollof/800/800' },
      { name: 'White Rice', description: 'Fluffy steamed white rice.', price: 6.00, category: 'SAVORY SIDES & STAPLES', isAvailable: true, imageUrl: 'https://picsum.photos/seed/wrice/800/800' },
    ];

    try {
      for (const item of initialMenu) {
        await addDoc(collection(db, 'menuItems'), item);
      }
      toast.success('Menu updated with NYC classics!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menuItems');
    }
  };

  const handleLogInOutBtn = () => {
    if (user) {
      handleLogout();
    } else {
      setIsAuthModalOpen(true);
      setAuthMode('signin');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'signin') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const u = userCredential.user;
        
        if (!u.emailVerified) {
          setPendingEmail(email);
          // Explicitly sign out unverified users during the login attempt
          await signOut(auth);
          setIsVerificationVisible(true);
          setIsAuthModalOpen(false);
          toast.error('Email not verified. Check your inbox.');
          return;
        }
        
        toast.success('Welcome back to Deli Boyz!');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        setPendingEmail(email);
        // Sign out immediately after signup to prevent auto-login
        await signOut(auth);
        setIsVerificationVisible(true);
        setIsAuthModalOpen(false);
        toast.success('Verification email sent!');
        return;
      }

      setIsAuthModalOpen(false);
      setEmail('');
      setPassword('');
      
      // Redirect to "dashboard"
      if (email === 'zxymgmt@gmail.com') {
        setIsAdminOpen(true);
        toast.success('Admin Dashboard Unlocked');
      } else {
        document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error: any) {
      console.error(error);
      const isInvalidCred = error.code === 'auth/wrong-password' || 
                           error.code === 'auth/user-not-found' || 
                           error.code === 'auth/invalid-credential' ||
                           error.code === 'auth/invalid-email';
      
      if (authMode === 'signin') {
        if (isInvalidCred) {
          toast.error('INVALID CREDENTIALS. CHECK YOUR EMAIL/PASSWORD.');
        } else {
          toast.error('ACCESS DENIED. LOGIN FAILED.');
        }
      } else {
        if (error.code === 'auth/email-already-in-use') {
          toast.error('ACCOUNT EXISTS. PLEASE SIGN IN.');
        } else if (error.code === 'auth/weak-password') {
          toast.error('PASSWORD TOO WEAK. TRY AGAIN.');
        } else {
          toast.error('REGISTRATION FAILED.');
        }
      }
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setCart([]);
    setIsAdminOpen(false);
    setIsCashierOpen(false);
    setIsProfileModalOpen(false);
    setView('home');
    toast.success('Logged out');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProfile = async (displayName: string) => {
    if (!auth.currentUser) return;
    try {
      // Update Auth Profile
      await updateProfile(auth.currentUser, { displayName });
      
      // Update Firestore Profile
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        displayName
      });
      
      toast.success('Profile updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const handleCheckout = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      setAuthMode('signin');
      return;
    }

    setIsCheckingOut(true);
    try {
      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const orderData = {
        customerId: user.uid,
        customerEmail: user.email,
        customerName: user.displayName || user.email?.split('@')[0],
        items: cart,
        total,
        status: 'pending',
        paymentStatus: 'unpaid',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'orders'), orderData);
      setCart([]);
      setIsCartOpen(false);
      toast.success('Order placed successfully! Pay at pickup.', { duration: 5000 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const updateOrderStatus = async (id: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', id), { status });
      toast.success(`Order status updated to ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const updatePaymentStatus = async (id: string, paymentStatus: Order['paymentStatus']) => {
    try {
      await updateDoc(doc(db, 'orders', id), { paymentStatus });
      toast.success(`Payment status updated to ${paymentStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const handleCheckVerification = async () => {
    // We check auth.currentUser directly because the local 'user' state 
    // is set to null in the observer if it's not verified yet.
    const u = auth.currentUser;
    if (u) {
      await u.reload();
      if (u.emailVerified) {
        setIsVerificationVisible(false);
        toast.success('Email verified! You can now log in.');
        // If they click the button, we trigger the login modal so they can proceed
        setAuthMode('signin');
        setIsAuthModalOpen(true);
      } else {
        toast.error('Email still not verified. Please check your inbox.');
      }
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
          <p className="text-stone-500 font-medium animate-pulse">Loading Deli Boyz...</p>
        </div>
      </div>
    );
  }

  const handleLocationSelect = (location: string) => {
    if (location === 'HARLEM') {
      window.open('https://deli-boyz-new-york.cloveronline.com/menu/all', '_blank');
      setIsLocationModalOpen(false);
      return;
    }
    setSelectedLocation(location);
    setIsLocationModalOpen(false);
    setView('menu'); // Take them to the menu page to start ordering
    window.scrollTo(0, 0);
    toast.success(`Welcome to Deli Boyz ${location}!`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans text-white concrete-texture relative overflow-x-hidden">
      <Toaster position="bottom-center" />
      
      <Navbar 
        user={user} 
        isAdmin={isAdmin} 
        onLogin={handleLogInOutBtn} 
        onLogout={handleLogout}
        cartCount={cart.reduce((sum, i) => sum + i.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenCashier={() => setIsCashierOpen(true)}
        onOpenLoyalty={() => setView('loyalty')}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        onOpenMenu={() => {
          setView('menu');
          window.scrollTo(0, 0);
        }}
        onGoHome={() => setView('home')}
      />

      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        mode={authMode}
        setMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        onSubmit={handleEmailAuth}
      />

      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        onSave={handleSaveProfile}
      />

      <LocationModal 
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        onSelect={handleLocationSelect}
      />

      <VerificationScreen 
        isOpen={isVerificationVisible}
        email={pendingEmail}
        onClose={() => setIsVerificationVisible(false)}
        onLoginClick={() => {
          setIsVerificationVisible(false);
          setIsAuthModalOpen(true);
          setAuthMode('signin');
        }}
        onCheckVerification={handleCheckVerification}
      />

      {/* Marquee */}
      <div className="bg-black text-white py-3 overflow-hidden border-b-4 border-black">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(10)].map((_, i) => (
            <span key={i} className="text-2xl font-display uppercase tracking-widest mx-8">
              Deli Boyz NYC • NYC's Finest Deli • Best Sandwiches • Open Late • 
            </span>
          ))}
        </div>
      </div>

      {view === 'home' && (
        <header className="relative min-h-screen py-20 flex items-center justify-center overflow-hidden border-b-8 border-black concrete-texture">
          <div className="grain-overlay opacity-10" />
          
          {/* Subtle Background Urban Texture */}
          <div className="urban-texture top-20 left-10 rotate-12 text-4xl opacity-5">#KING</div>
          <div className="urban-texture bottom-40 right-20 -rotate-12 text-5xl opacity-5">NYC 24/7</div>
          <div className="urban-texture top-1/2 left-20 rotate-90 text-2xl opacity-5">5ive Boroughs</div>

          {/* Large Motion Blurred B&W Image */}
          <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.3, scale: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute right-[-10%] bottom-0 w-[80%] h-full z-0 pointer-events-none"
          >
            <img 
              src="https://images.unsplash.com/photo-1600891964599-f61ba0e24092?q=80&w=2000&auto=format&fit=crop"
              className="w-full h-full object-cover motion-blur-steak"
              referrerPolicy="no-referrer"
            />
          </motion.div>

          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/40 via-[#0a0a0a]/80 to-[#0a0a0a] z-[1]" />
          
          <div className="relative z-10 text-center px-4 max-w-[1400px] w-full mx-auto flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <div className="mb-8">
                <div className="bg-orange-600 text-white px-6 py-2 font-display text-2xl uppercase tracking-widest border-4 border-black inline-block">
                  EST. IN NEW YORK
                </div>
              </div>
              
              <h1 className="text-8xl sm:text-9xl md:text-[10rem] lg:text-[11rem] font-display leading-[1] uppercase tracking-tighter text-white neon-outline mb-12">
                DELI BOYZ
              </h1>
              
              <div className="max-w-3xl mx-auto flex flex-col items-center">
                <p className="text-2xl md:text-3xl text-white font-display uppercase tracking-tight mb-12 leading-none">
                  NYC'S MOST AUTHENTIC DELI.<br/>
                  <span className="text-orange-500">HARLEM + BRONX</span>
                </p>
                
                <button 
                  onClick={() => setIsLocationModalOpen(true)}
                  className="bg-black text-[#ff4500] px-20 py-7 font-display text-4xl uppercase border-4 border-[#ff4500] neon-orange-box hover:bg-white hover:text-black hover:border-white hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
                >
                  Order Now
                </button>
              </div>
            </motion.div>
          </div>

          {/* Bottom Dotted Pattern & Tags - Centered */}
          <div className="absolute bottom-0 left-0 w-full h-40 dot-pattern z-[2] opacity-50 flex items-center justify-center gap-16 md:gap-32">
            <div className="relative group">
              <span className="spray-tag text-5xl md:text-7xl rotate-[-3deg] block">#harlem</span>
              <div className="spray-drip left-1/4 h-12 top-full" />
              <div className="spray-drip left-1/2 h-8 top-full opacity-30" />
            </div>
            <div className="relative group">
              <span className="spray-tag text-5xl md:text-7xl rotate-[4deg] translate-y-4 block">#bronx</span>
              <div className="spray-drip right-1/4 h-16 top-full translate-y-4" />
            </div>
          </div>
        </header>
      )}

      <main className="pb-24">
        {view === 'home' ? (
          <>
            {/* Info Bar */}
            <div className="bg-[#0a0a0a] border-y-8 border-black py-12 relative overflow-hidden">
              <div className="grain-overlay" />
              <div className="max-w-[1400px] mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-white relative z-10">
                <div className="flex items-center gap-6 justify-center">
                  <MapPin size={48} className="text-orange-500" />
                  <div className="flex flex-col">
                    <span className="text-4xl font-display uppercase leading-none text-white">NYC Born</span>
                    <span className="font-sans font-bold text-xs uppercase tracking-[0.2em] text-orange-500">Since Day One</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 justify-center">
                  <Clock size={48} className="text-orange-500" />
                  <div className="flex flex-col">
                    <span className="text-4xl font-display uppercase leading-none text-white">Open Late</span>
                    <span className="font-sans font-bold text-xs uppercase tracking-[0.2em] text-orange-500">24/7 Energy</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 justify-center">
                  <Phone size={48} className="text-orange-500" />
                  <div className="flex flex-col">
                    <span className="text-4xl font-display uppercase leading-none text-white">CONTACT</span>
                    <span className="font-sans font-bold text-xs uppercase tracking-[0.2em] text-orange-500">Call To Order</span>
                  </div>
                </div>
              </div>
            </div>

            <LocationsSection />
            <HistorySection />
          </>
        ) : view === 'menu' ? (
          <div className="pt-20">
            <div className="max-w-[1400px] mx-auto px-6 mb-12 flex justify-between items-end">
              <div>
                <h1 className="text-7xl md:text-9xl font-display uppercase tracking-tighter text-white">The Menu</h1>
                <p className="text-orange-500 font-display text-2xl uppercase tracking-widest mt-4">Pure NYC Flavors</p>
              </div>
              <button 
                onClick={() => { setView('home'); window.scrollTo(0, 0); }}
                className="bg-white text-black px-8 py-3 font-display text-xl uppercase border-4 border-black shadow-[4px_4px_0px_0px_rgba(255,69,0,1)] hover:bg-orange-600 hover:text-white transition-all"
              >
                Back Home
              </button>
            </div>
            <MenuSection items={menuItems} onAddToCart={addToCart} viewOnly={!selectedLocation} />
          </div>
        ) : user ? (
          <ProfileDashboard user={user} />
        ) : (
          <div className="pt-40 pb-32 text-center">
            <Crown size={64} className="mx-auto text-[#ff4500] mb-6" />
            <h1 className="text-5xl md:text-6xl font-display uppercase tracking-tighter text-white mb-4">
              Sign in to unlock your loyalty rewards
            </h1>
            <p className="text-stone-400 font-sans uppercase tracking-widest mb-8">
              Earn 1 point per $1 and redeem single-use promos
            </p>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="bg-black text-[#ff4500] px-12 py-5 font-display text-3xl uppercase border-4 border-[#ff4500] neon-orange-box hover:bg-white hover:text-black hover:border-white transition-all"
            >
              Login / Join
            </button>
          </div>
        )}
      </main>

      {/* Mobile Sticky Order Button */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 md:hidden w-full px-4">
        <button 
          onClick={() => setIsCartOpen(true)}
          className="w-full bg-black text-white py-5 font-display text-3xl uppercase shadow-[8px_8px_0px_0px_rgba(234,88,12,1)] hover:bg-white hover:text-black hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none flex items-center justify-center gap-4 transition-all"
        >
          <ShoppingCart size={32} />
          Order Now ({cart.reduce((sum, i) => sum + i.quantity, 0)})
        </button>
      </div>

      {/* Footer */}
      <footer className="bg-[#050505] text-white py-24 border-t border-stone-900 relative overflow-hidden">
        <div className="grain-overlay opacity-5" />
        <div className="max-w-[1400px] mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-16">
            <div>
              <h2 className="text-8xl font-display uppercase tracking-tighter mb-8 leading-[0.85] text-[#ff4500] drop-shadow-[0_0_12px_rgba(255,69,0,0.6)]">
                DELI BOYZ<br/>NYC
              </h2>
              <p className="text-2xl font-display uppercase text-stone-400 max-w-md leading-tight mb-10 tracking-tight">
                Born in <span className="text-[#ff4500]">Harlem</span>, raised in the <span className="text-[#ff4500]">Bronx</span>.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-14 h-14 flex items-center justify-center border-[1px] border-red-600/50 text-[#ff4500] transition-all hover:bg-red-600/10 hover:border-red-600 hover:shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                  <Instagram size={28} />
                </a>
                <a href="#" className="w-14 h-14 flex items-center justify-center border-[1px] border-red-600/50 text-[#ff4500] transition-all hover:bg-red-600/10 hover:border-red-600 hover:shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                  <Phone size={28} />
                </a>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-6">
                <h4 className="text-2xl font-display uppercase tracking-wider text-[#ff4500]">Explore</h4>
                <ul className="space-y-4 text-sm font-display uppercase tracking-[0.2em] text-white">
                  <li><button onClick={() => { setView('menu'); window.scrollTo(0, 0); }} className="hover:text-[#ff4500] transition-all duration-300">Menu</button></li>
                  <li><button onClick={() => { setView('loyalty'); window.scrollTo(0, 0); }} className="hover:text-[#ff4500] transition-all duration-300">Loyalty</button></li>
                  <li><button onClick={() => { setView('home'); setTimeout(() => document.getElementById('locations')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-[#ff4500] transition-all duration-300">Locations</button></li>
                  <li><button onClick={() => { setView('home'); setTimeout(() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' }), 100); }} className="hover:text-[#ff4500] transition-all duration-300">History</button></li>
                </ul>
              </div>
              <div className="space-y-6">
                <h4 className="text-2xl font-display uppercase tracking-wider text-[#ff4500]">Connect</h4>
                <ul className="space-y-4 text-sm font-display uppercase tracking-[0.2em] text-white">
                  <li><a href="#" className="hover:text-[#ff4500] transition-all duration-300">Support</a></li>
                  <li><a href="#" className="hover:text-[#ff4500] transition-all duration-300">Catering</a></li>
                  <li><a href="#" className="hover:text-[#ff4500] transition-all duration-300">Careers</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="pt-16 border-t border-stone-900 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="font-display uppercase text-stone-600 text-sm tracking-widest leading-none">© 2026 Deli Boyz NYC. All rights reserved.</p>
            <div className="flex gap-8 font-display uppercase text-stone-600 text-sm tracking-widest">
              <a href="#" className="hover:text-white transition-colors underline underline-offset-4 decoration-stone-800 hover:decoration-white">Privacy</a>
              <a href="#" className="hover:text-white transition-colors underline underline-offset-4 decoration-stone-800 hover:decoration-white">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)} 
        items={cart}
        onUpdateQty={updateCartQty}
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
        isCheckingOut={isCheckingOut}
      />

      {isAdminOpen && (
        <AdminDashboard 
          orders={orders} 
          menuItems={menuItems}
          onUpdateOrderStatus={updateOrderStatus}
          onUpdatePaymentStatus={updatePaymentStatus}
          onClose={() => setIsAdminOpen(false)}
        />
      )}

      {isCashierOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-[#0a0a0a] z-[120] flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-stone-700 border-t-[#ff4500] rounded-full animate-spin" />
          </div>
        }>
          <CashierScanner onClose={() => setIsCashierOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
