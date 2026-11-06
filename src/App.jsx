import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Shield, 
  Check, 
  ArrowRight, 
  LogOut, 
  LogIn, 
  Search, 
  AlertCircle, 
  Edit3, 
  CheckCircle2, 
  User, 
  Phone, 
  Briefcase, 
  Clock, 
  Download, 
  X, 
  Monitor, 
  RefreshCw,
  Info,
  ChevronDown,
  Building,
  Calendar,
  Layers,
  Sparkles,
  UserCheck
} from 'lucide-react';

const VISIT_PURPOSES = [
  'Delivery',
  'Admissions appointment',
  'Library research',
  'Faculty meeting',
  'Campus tour',
  'Facilities maintenance',
  'Guest lecture'
];

async function requestApi(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the VisitorLog API. Start the app with "npm run start".');
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`VisitorLog returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.error || `VisitorLog request failed (${response.status}).`);
  }
  return result;
}

export default function App() {
  // Navigation & View Mode State
  const [currentScreen, setCurrentScreen] = useState(1); // 1 to 5
  const navigate = useNavigate();
  const location = useLocation();
  const viewMode = location.pathname.startsWith('/staff') ? 'dashboard' : 'kiosk';
  
  // Shared Active Visitor Directory
  const [activeVisitors, setActiveVisitors] = useState([]);
  const [returningProfiles, setReturningProfiles] = useState([]);
  const [profileLookupError, setProfileLookupError] = useState('');
  const [profileLookupLoading, setProfileLookupLoading] = useState(false);

  // Form Registration State (Screens 2 & 3)
  const [formData, setFormData] = useState({
    fullName: '',
    contactNumber: '',
    purpose: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');

  // Generated pass for newly checked-in visitor (Screen 4)
  const [issuedPass, setIssuedPass] = useState(null);

  // Rapid Exit Modal State
  const [rapidExitModalOpen, setRapidExitModalOpen] = useState(false);
  const [rapidExitQuery, setRapidExitQuery] = useState('');
  
  // Security Dashboard Rapid Check-out input
  const [dashCheckoutName, setDashCheckoutName] = useState('');
  const [dashFilterQuery, setDashFilterQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeVisitorsError, setActiveVisitorsError] = useState('');

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  useEffect(() => {
    let isMounted = true;
    setActiveVisitorsError('');
    requestApi('/api/visitors/active')
      .then((visitors) => {
        if (isMounted) {
          setActiveVisitors(visitors);
          setLastUpdated(new Date());
        }
      })
      .catch((error) => {
        if (isMounted) {
          setActiveVisitorsError(error.message);
          showToast(error.message, 'error');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (viewMode === 'dashboard') setCurrentScreen(5);
    else if (currentScreen === 5) setCurrentScreen(1);
  }, [viewMode, currentScreen]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setProfileLookupLoading(true);
      setProfileLookupError('');
      const query = new URLSearchParams({ search: lookupQuery });
      requestApi(`/api/profiles?${query}`, { signal: controller.signal })
        .then((profiles) => setReturningProfiles(profiles))
        .catch((error) => {
          if (!controller.signal.aborted) {
            setProfileLookupError(error.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setProfileLookupLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [lookupQuery]);

  // Validation logic
  const validateForm = () => {
    const errors = {};
    if (!formData.fullName.trim()) {
      errors.fullName = 'Full name is required';
    }
    if (!formData.contactNumber.trim()) {
      errors.contactNumber = 'Contact number is required';
    } else if (formData.contactNumber.replace(/[^0-9]/g, '').length < 8) {
      errors.contactNumber = 'Please enter a valid mobile/phone number';
    }
    if (!formData.purpose) {
      errors.purpose = 'Please select a purpose of visit';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep2 = () => {
    if (validateForm()) {
      setCurrentScreen(3);
    } else {
      showToast('Please complete all required fields correctly', 'error');
    }
  };

  // Confirm registration -> Issue Pass & Save to directory
  const handleConfirmCheckIn = async () => {
    try {
      const newVisitor = await requestApi('/api/visitors/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          contact: formData.contactNumber,
          purpose: formData.purpose,
        }),
      });

      setActiveVisitors(prev => [newVisitor, ...prev]);
      setLastUpdated(new Date());
      setReturningProfiles(prev => [
        { name: newVisitor.name, contact: newVisitor.contact, purpose: newVisitor.purpose },
        ...prev.filter(profile => profile.name.toLowerCase() !== newVisitor.name.toLowerCase())
      ]);
      setIssuedPass(newVisitor);
      showToast(`Welcome ${newVisitor.name}! Checked in successfully.`, 'success');
      setCurrentScreen(4);
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  // Check out visitor handler
  const handleCheckOutVisitor = async (visitorIdOrName) => {
    const target = activeVisitors.find(
      v => v.id === visitorIdOrName || v.name.toLowerCase() === visitorIdOrName.trim().toLowerCase()
    );

    const name = target?.name || (typeof visitorIdOrName === 'string' ? visitorIdOrName.trim() : '');
    if (target || name) {
      try {
        if (target) {
        await requestApi(`/api/visitors/${encodeURIComponent(target.id)}/check-out`, {
          method: 'POST',
        });
        setActiveVisitors(prev => prev.filter(v => v.id !== target.id));
        setLastUpdated(new Date());
        } else {
          await requestApi('/api/visitors/check-out-by-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: name }),
          });
        }
        showToast(`${name} has been checked out successfully.`, 'info');
        setDashCheckoutName('');
        setRapidExitQuery('');
        setRapidExitModalOpen(false);
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      }
    } else {
      showToast('Enter the visitor name used at check-in.', 'error');
      return false;
    }
  };

  // Auto-fill from returning profile
  const handleSelectReturningProfile = (profile) => {
    setFormData({
      fullName: profile.name,
      contactNumber: profile.contact || '',
      purpose: profile.purpose
    });
    setFormErrors({});
    setIsLookupOpen(false);
    setLookupQuery('');
    showToast(`Profile loaded for ${profile.name}`, 'info');
  };

  // Export Emergency Roster (CSV)
  const handleExportRoster = async () => {
    try {
      const visitors = await requestApi('/api/visitors/roster');
      const headers = ['Visitor ID', 'Full Name', 'Contact Number', 'Purpose of Visit', 'Entry Timestamp', 'Checkout Timestamp', 'Current Status'];
      const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = visitors.map(v => [
        v.id,
        v.name,
        v.contact,
        v.purpose,
        v.entryTime,
        v.checkoutTime,
        v.status,
      ].map(escapeCsvValue));

      const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
      const encodedUri = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `VisitorLog_Emergency_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported emergency roster with ${visitors.length} visit records`, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  // Screen Names mapper
  const screenTitleMap = {
    1: '01 / WELCOME SCREEN',
    2: '02 / VISITOR REGISTRATION',
    3: '03 / REGISTRATION REVIEW',
    4: '04 / DIGITAL GATE PASS',
    5: '05 / SECURITY DASHBOARD'
  };

  const filteredProfiles = returningProfiles;

  // Dashboard filtered visitors
  const dashboardVisitors = useMemo(() => {
    if (!dashFilterQuery.trim()) return activeVisitors;
    const q = dashFilterQuery.toLowerCase();
    return activeVisitors.filter(v =>
      v.name.toLowerCase().includes(q)
      || v.purpose.toLowerCase().includes(q)
      || String(v.contact || '').toLowerCase().includes(q)
    );
  }, [activeVisitors, dashFilterQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-800 focus:shadow-lg">
        Skip to content
      </a>
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-bounce duration-300">
          <div className={`px-4 py-3 rounded-lg shadow-xl text-white flex items-center gap-3 border ${
            toastMessage.type === 'error' ? 'bg-red-600 border-red-400' :
            toastMessage.type === 'success' ? 'bg-emerald-600 border-emerald-400' :
            'bg-blue-600 border-blue-400'
          }`}>
            {toastMessage.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
             toastMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
             <Info className="w-5 h-5" />}
            <span className="text-sm font-semibold tracking-wide">{toastMessage.message}</span>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => { setCurrentScreen(1); navigate('/kiosk'); }}
            className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            aria-label="VisitorLog home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm">
              <Shield className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-lg font-extrabold leading-tight tracking-tight text-slate-900">VisitorLog</span>
              <span className="hidden text-xs text-slate-500 sm:block">Visitor management</span>
            </span>
          </button>
          <nav aria-label="Main navigation" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(viewMode === 'dashboard' ? '/kiosk' : '/staff')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                viewMode === 'dashboard' ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {viewMode === 'dashboard' ? 'Visitor kiosk' : 'Security desk'}
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN VIEWPORT STAGE */}
      <main id="main-content" className={`flex-1 flex items-center justify-center p-3 sm:p-6 overflow-y-auto ${viewMode === 'kiosk' ? 'bg-slate-100' : 'bg-slate-50'}`}>
        {viewMode === 'kiosk' ? (
          /* ========================================================================= */
          /* PORTRAIT TOUCH KIOSK FRAME (480px max-width, realistic standing kiosk)   */
          /* ========================================================================= */
          <div className="w-full max-w-[480px] bg-[#F8FAFC] rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col min-h-[780px] transition-all duration-300">
            
            {/* 1. Thin Royal Blue Top Status Bar */}
            <div className="bg-[#1D4ED8] text-white px-4 py-1.5 flex justify-between items-center text-[10px] font-mono tracking-wider font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                VISITOR SERVICES • PUBLIC KIOSK
              </span>
              <span>{screenTitleMap[currentScreen]}</span>
            </div>

            {/* 2. White Corporate Branding Bar */}
            <div className="bg-white px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 shadow-xs">
                  <Shield className="w-6 h-6 stroke-[2.2] text-[#1D4ED8]" />
                  <User className="w-3.5 h-3.5 absolute text-[#1D4ED8] mt-[-2px]" />
                  <div className="absolute -bottom-1 -right-1 bg-[#10B981] text-white rounded-full p-0.5 ring-2 ring-white">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight leading-tight flex items-center">
                    <span className="text-[#1E3A8A]">Visitor</span>
                    <span className="text-[#10B981]">Log</span>
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 tracking-widest mt-0.5">
                    CHECK IN • CHECK OUT
                  </p>
                </div>
              </div>
              <button 
                onClick={() => navigate('/staff')}
                className="text-xs text-blue-700 hover:text-blue-900 font-semibold bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-200 transition-colors flex items-center gap-1"
                title="Open Security Desk"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Guard Desk</span>
              </button>
            </div>

            {/* 3. KIOSK SCREEN CONTENT AREA */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              
              {/* SCREEN 1: KIOSK WELCOME */}
              {currentScreen === 1 && (
                <div className="flex-1 flex flex-col justify-between animate-fadeIn">
                  <div>
                    <div className="mt-4 mb-8">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-3">
                        <Building className="w-3 h-3 text-blue-600" />
                        Main Entrance Kiosk 01
                      </span>
                      <h2 className="text-3xl font-extrabold text-[#0F172A] tracking-tight leading-tight">
                        Welcome.<br />Start here.
                      </h2>
                      <p className="text-slate-600 text-sm mt-2 font-normal leading-relaxed">
                        Please check in when you arrive and check out before you leave the facility.
                      </p>
                    </div>

                    {/* Action Cards */}
                    <div className="space-y-4">
                      {/* Card 1: New Visitor Check-In */}
                      <button
                        onClick={() => {
                          setFormData({ fullName: '', contactNumber: '', purpose: '' });
                          setFormErrors({});
                          setCurrentScreen(2);
                        }}
                        className="w-full text-left bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] text-white p-5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 group flex items-center justify-between border border-blue-600 cursor-pointer min-h-[88px]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-white/15 rounded-xl backdrop-blur-xs text-white group-hover:scale-105 transition-transform">
                            <LogIn className="w-6 h-6 stroke-[2.2]" />
                          </div>
                          <div>
                            <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                              New Visitor Check-In
                            </div>
                            <div className="text-xs text-blue-100 font-normal mt-0.5">
                              Arriving? Register your visit here.
                            </div>
                          </div>
                        </div>
                        <div className="p-2 rounded-full bg-white/10 group-hover:bg-white/20 transition-colors">
                          <ArrowRight className="w-5 h-5 text-white transform group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>

                      {/* Card 2: Rapid Exit / Check-Out */}
                      <button
                        onClick={() => setRapidExitModalOpen(true)}
                        className="w-full text-left bg-white hover:bg-slate-50 active:bg-blue-50/50 text-[#1D4ED8] p-5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 group flex items-center justify-between border-2 border-[#1D4ED8]/80 cursor-pointer min-h-[88px]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-blue-50 rounded-xl text-[#1D4ED8] group-hover:scale-105 transition-transform">
                            <LogOut className="w-6 h-6 stroke-[2.2]" />
                          </div>
                          <div>
                            <div className="font-bold text-base tracking-tight text-[#0F172A] flex items-center gap-1.5">
                              Rapid Exit / Check-Out
                            </div>
                            <div className="text-xs text-slate-500 font-normal mt-0.5">
                              Leaving? Complete your visit here.
                            </div>
                          </div>
                        </div>
                        <div className="p-2 rounded-full bg-slate-100 group-hover:bg-blue-100 text-[#1D4ED8] transition-colors">
                          <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Bottom Note */}
                  <div className="mt-8 pt-4 border-t border-slate-200">
                    <div className="flex items-center gap-2.5 text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                      <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Your details are safely stored for visitor safety, access auditing, and compliance records.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SCREEN 2: VISITOR REGISTRATION & LOOKUP */}
              {currentScreen === 2 && (
                <div className="flex-1 flex flex-col justify-between animate-fadeIn">
                  <div>
                    {/* Progress Indicator */}
                    <div className="mb-5">
                      <div className="flex justify-between items-center text-[11px] font-bold tracking-wider text-blue-700 uppercase mb-2">
                        <span>CHECK-IN / STEP 1 OF 3</span>
                        <span className="text-slate-400 font-mono">33%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 h-2">
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                        <div className="bg-slate-200 rounded-full"></div>
                        <div className="bg-slate-200 rounded-full"></div>
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
                      Tell us about your visit
                    </h2>
                    <p className="text-slate-500 text-xs mt-1 mb-4">
                      Enter your details below to begin your check-in.
                    </p>

                    {/* Profile Lookup Box (Returning visitors) */}
                    <div className="mb-5 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200 rounded-xl p-3.5 relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-blue-700" />
                          Profile Lookup
                        </span>
                        <span className="text-[10px] text-blue-600 bg-white/80 px-2 py-0.5 rounded-full font-medium border border-blue-200">
                          Returning visitors - Optional
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search returning visitor by name..."
                          value={lookupQuery}
                          onFocus={() => setIsLookupOpen(true)}
                          onChange={(e) => {
                            setLookupQuery(e.target.value);
                            setIsLookupOpen(true);
                          }}
                          className="w-full bg-white text-xs text-slate-800 placeholder-slate-400 pl-8 pr-8 py-2 rounded-lg border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                        {lookupQuery && (
                          <button 
                            onClick={() => { setLookupQuery(''); setIsLookupOpen(false); }}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Lookup suggestions drop menu */}
                        {isLookupOpen && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 z-30 max-h-48 overflow-y-auto">
                            <div className="p-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 flex justify-between">
                              <span>Saved Visitor Profiles</span>
                              <span>Prefill name and purpose</span>
                            </div>
                            {profileLookupError ? (
                              <div className="p-3 text-xs text-red-600" role="alert">
                                {profileLookupError}
                              </div>
                            ) : profileLookupLoading ? (
                              <div className="p-3 text-xs text-slate-400 text-center">
                                Searching saved profiles...
                              </div>
                            ) : filteredProfiles.length > 0 ? (
                              filteredProfiles.map((item, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSelectReturningProfile(item)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-b-0 flex items-center justify-between"
                                >
                                  <div>
                                    <div className="font-semibold text-slate-800">{item.name}</div>
                                    <div className="text-[10px] text-slate-500">Saved visit • {item.purpose}</div>
                                  </div>
                                  <span className="text-[10px] font-medium text-blue-600 bg-blue-100/70 px-1.5 py-0.5 rounded">
                                    Load
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="p-3 text-xs text-slate-400 text-center">
                                No profile matching "{lookupQuery}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Registration Form Fields */}
                    <div className="space-y-3.5">
                      {/* Full Name */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Enter full name (e.g. Alex Morgan)"
                            value={formData.fullName}
                            onChange={(e) => {
                              setFormData({ ...formData, fullName: e.target.value });
                              if (formErrors.fullName) setFormErrors({ ...formErrors, fullName: null });
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border ${
                              formErrors.fullName 
                                ? 'border-red-500 ring-1 ring-red-400 bg-red-50/20' 
                                : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                            } outline-none transition-all`}
                          />
                          {formErrors.fullName && (
                            <AlertCircle className="w-4 h-4 text-red-500 absolute right-3 top-3" />
                          )}
                        </div>
                        {formErrors.fullName && (
                          <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                            {formErrors.fullName}
                          </p>
                        )}
                      </div>

                      {/* Contact Number */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Contact Number <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="tel"
                            placeholder="e.g. +63 968 567 6425"
                            value={formData.contactNumber}
                            onChange={(e) => {
                              setFormData({ ...formData, contactNumber: e.target.value });
                              if (formErrors.contactNumber) setFormErrors({ ...formErrors, contactNumber: null });
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-lg text-sm bg-white border ${
                              formErrors.contactNumber 
                                ? 'border-red-500 ring-1 ring-red-400 bg-red-50/20' 
                                : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                            } outline-none transition-all`}
                          />
                          {formErrors.contactNumber && (
                            <AlertCircle className="w-4 h-4 text-red-500 absolute right-3 top-3" />
                          )}
                        </div>
                        {formErrors.contactNumber && (
                          <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                            {formErrors.contactNumber}
                          </p>
                        )}
                      </div>

                      {/* Purpose of Visit */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Purpose of Visit <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            value={formData.purpose}
                            onChange={(e) => {
                              setFormData({ ...formData, purpose: e.target.value });
                              if (formErrors.purpose) setFormErrors({ ...formErrors, purpose: null });
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-lg text-sm bg-white appearance-none border ${
                              formErrors.purpose 
                                ? 'border-red-500 ring-1 ring-red-400 bg-red-50/20' 
                                : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100'
                            } outline-none transition-all text-slate-800 pr-10 cursor-pointer`}
                          >
                            <option value="">Select purpose of visit...</option>
                            {VISIT_PURPOSES.map((p, idx) => (
                              <option key={idx} value={p}>{p}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                        </div>
                        {formErrors.purpose && (
                          <p className="text-[11px] text-red-600 font-medium mt-1 flex items-center gap-1">
                            {formErrors.purpose}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="mt-8 pt-4 border-t border-slate-200 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentScreen(1)}
                      className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 active:bg-slate-200 text-sm font-semibold transition-colors min-h-[52px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleNextStep2}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-sm text-white shadow-sm transition-all duration-200 min-h-[52px] ${
                        formData.fullName && formData.contactNumber && formData.purpose
                          ? 'bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] cursor-pointer'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <span>Next</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 3: REGISTRATION REVIEW */}
              {currentScreen === 3 && (
                <div className="flex-1 flex flex-col justify-between animate-fadeIn">
                  <div>
                    {/* Progress Indicator */}
                    <div className="mb-5">
                      <div className="flex justify-between items-center text-[11px] font-bold tracking-wider text-blue-700 uppercase mb-2">
                        <span>CHECK-IN / STEP 2 OF 3</span>
                        <span className="text-slate-400 font-mono">66%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 h-2">
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                        <div className="bg-slate-200 rounded-full"></div>
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
                      Review your details
                    </h2>
                    <p className="text-slate-500 text-xs mt-1 mb-5">
                      Please make sure everything is correct before you confirm.
                    </p>

                    {/* Summary Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden mb-4">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-700">
                        <User className="w-4 h-4 text-blue-600" />
                        <span>Your visit details</span>
                      </div>
                      <div className="p-4 divide-y divide-slate-100 text-sm">
                        <div className="py-2.5 flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">Full Name</span>
                          <span className="font-bold text-[#0F172A]">{formData.fullName}</span>
                        </div>
                        <div className="py-2.5 flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">Contact Number</span>
                          <span className="font-mono text-slate-800 text-xs font-semibold">{formData.contactNumber}</span>
                        </div>
                        <div className="py-2.5 flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">Purpose of Visit</span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {formData.purpose}
                          </span>
                        </div>
                        <div className="py-2.5 flex justify-between items-center">
                          <span className="text-xs text-slate-500 font-medium">Check-In Station</span>
                          <span className="text-xs text-slate-600">Main Entrance Kiosk 01</span>
                        </div>
                      </div>
                    </div>

                    {/* Soft Blue Information Banner */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>
                        Confirming will check you in immediately, assign a verified digital pass, and log your entry in the security directory.
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: Edit and Confirm */}
                  <div className="mt-8 pt-4 border-t border-slate-200 space-y-2.5">
                    <button
                      type="button"
                      onClick={handleConfirmCheckIn}
                      className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-sm text-white bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] shadow-md transition-all duration-200 min-h-[52px] cursor-pointer"
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                      <span>Confirm & Check In</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCurrentScreen(2)}
                      className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm text-blue-700 bg-white hover:bg-slate-50 active:bg-blue-50 border border-blue-300 transition-colors min-h-[48px] cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Edit Information</span>
                    </button>
                  </div>
                </div>
              )}

              {/* SCREEN 4: CHECK-IN COMPLETE / DIGITAL PASS */}
              {currentScreen === 4 && (
                <div className="flex-1 flex flex-col justify-between animate-fadeIn">
                  <div>
                    {/* Progress Indicator */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center text-[11px] font-bold tracking-wider text-emerald-700 uppercase mb-2">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          CHECK-IN / STEP 3 OF 3 COMPLETE
                        </span>
                        <span className="text-emerald-700 font-mono">100%</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 h-2">
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                        <div className="bg-[#1D4ED8] rounded-full"></div>
                      </div>
                    </div>

                    <div className="text-center my-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-2 shadow-inner">
                        <Check className="w-7 h-7 stroke-[3]" />
                      </div>
                      <h2 className="text-2xl font-black text-[#0F172A] tracking-tight">
                        Check-In Successful
                      </h2>
                      <p className="text-slate-500 text-xs mt-0.5">
                        You're all set. Please proceed to reception or your meeting.
                      </p>
                    </div>

                    {/* DIGITAL VISITOR PASS CARD */}
                    <div className="bg-white rounded-2xl border-2 border-blue-700/80 shadow-lg overflow-hidden mt-3 relative">
                      {/* Pass Header */}
                      <div className="bg-[#1D4ED8] px-4 py-3 flex items-center justify-between text-white">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-blue-200" />
                          <span className="text-xs font-bold tracking-wide uppercase">Digital Visitor Pass</span>
                        </div>
                        <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-wider">
                          CHECKED-IN
                        </span>
                      </div>

                      {/* Pass Details */}
                      <div className="p-4 bg-white text-center">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">
                          {issuedPass ? issuedPass.name : formData.fullName || 'Alex Morgan'}
                        </h3>
                        <p className="text-xs font-semibold text-blue-600 mt-0.5">
                          {issuedPass ? issuedPass.purpose : formData.purpose || 'Delivery'}
                        </p>
                        
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-2 font-mono">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{issuedPass ? issuedPass.entryTime : getFormattedTimestamp()}</span>
                        </div>

                        {/* Simulated SVG QR Code */}
                        <div className="my-4 flex flex-col items-center">
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl inline-block shadow-inner">
                            <svg className="w-36 h-36" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect width="120" height="120" fill="white"/>
                              {/* QR Finder 1 (Top Left) */}
                              <rect x="10" y="10" width="30" height="30" rx="4" fill="#0F172A"/>
                              <rect x="16" y="16" width="18" height="18" fill="white"/>
                              <rect x="20" y="20" width="10" height="10" rx="2" fill="#1D4ED8"/>

                              {/* QR Finder 2 (Top Right) */}
                              <rect x="80" y="10" width="30" height="30" rx="4" fill="#0F172A"/>
                              <rect x="86" y="16" width="18" height="18" fill="white"/>
                              <rect x="90" y="20" width="10" height="10" rx="2" fill="#1D4ED8"/>

                              {/* QR Finder 3 (Bottom Left) */}
                              <rect x="10" y="80" width="30" height="30" rx="4" fill="#0F172A"/>
                              <rect x="16" y="86" width="18" height="18" fill="white"/>
                              <rect x="20" y="90" width="10" height="10" rx="2" fill="#1D4ED8"/>

                              {/* Simulated Data Matrix Dots */}
                              <rect x="46" y="12" width="6" height="6" fill="#0F172A"/>
                              <rect x="56" y="16" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="66" y="12" width="6" height="6" fill="#0F172A"/>
                              
                              <rect x="46" y="30" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="56" y="24" width="6" height="6" fill="#0F172A"/>
                              <rect x="66" y="36" width="6" height="6" fill="#0F172A"/>

                              <rect x="12" y="48" width="6" height="6" fill="#0F172A"/>
                              <rect x="24" y="58" width="6" height="6" fill="#0F172A"/>
                              <rect x="36" y="48" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="48" y="52" width="8" height="8" rx="2" fill="#10B981"/>
                              <rect x="62" y="50" width="6" height="6" fill="#0F172A"/>
                              <rect x="74" y="56" width="6" height="6" fill="#0F172A"/>
                              <rect x="88" y="48" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="102" y="54" width="6" height="6" fill="#0F172A"/>

                              <rect x="46" y="70" width="6" height="6" fill="#0F172A"/>
                              <rect x="60" y="72" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="52" y="84" width="6" height="6" fill="#0F172A"/>
                              <rect x="70" y="82" width="6" height="6" fill="#0F172A"/>

                              <rect x="82" y="82" width="6" height="6" fill="#1D4ED8"/>
                              <rect x="94" y="74" width="6" height="6" fill="#0F172A"/>
                              <rect x="104" y="86" width="6" height="6" fill="#0F172A"/>
                              <rect x="88" y="96" width="6" height="6" fill="#0F172A"/>
                              <rect x="100" y="100" width="6" height="6" fill="#1D4ED8"/>
                            </svg>
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium tracking-wide mt-1.5">
                            Sample visitor pass QR
                          </span>
                        </div>

                        <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                          System-issued timestamp • Read-only pass
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Kiosk Complete Bottom Action */}
                  <div className="mt-6 pt-3 border-t border-slate-200">
                    <p className="text-[11px] text-slate-500 text-center mb-3">
                      Before leaving, use <strong>Rapid Exit / Check-Out</strong> on the welcome screen.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ fullName: '', contactNumber: '', purpose: '' });
                        setIssuedPass(null);
                        setCurrentScreen(1);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] shadow-md transition-all duration-200 min-h-[52px] cursor-pointer"
                    >
                      <span>Back to Home</span>
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* 4. Common Footer (Kiosk screens 1–4) */}
            <div className="bg-white border-t border-[#E2E8F0] px-6 py-3 flex justify-between items-center text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                Need help? Please contact reception.
              </span>
              <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                English
              </span>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* LANDSCAPE SECURITY DASHBOARD FRAME (Screen 5 - 1024px width monitor)     */
          /* ========================================================================= */
          <div className="w-full max-w-[1024px] bg-[#F8FAFC] rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col min-h-[660px] animate-fadeIn">
            {/* Top Bar Indicator */}
            <div className="bg-[#1D4ED8] text-white px-5 py-1.5 flex justify-between items-center text-xs font-mono font-semibold">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                STAFF SECURITY CONSOLE
              </span>
              <span>SCREEN 05 / SECURITY MONITORING DASHBOARD</span>
            </div>

            {/* Dashboard Header */}
            <div className="bg-white px-6 py-4 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 shadow-xs">
                  <Shield className="w-6 h-6 stroke-[2.2] text-[#1D4ED8]" />
                  <User className="w-3.5 h-3.5 absolute text-[#1D4ED8] mt-[-2px]" />
                  <div className="absolute -bottom-1 -right-1 bg-[#10B981] text-white rounded-full p-0.5 ring-2 ring-white">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight leading-tight flex items-center">
                    <span className="text-[#1E3A8A]">Visitor</span>
                    <span className="text-[#10B981]">Log</span>
                  </h1>
                  <p className="text-[10px] font-bold text-slate-500 tracking-wider">
                    SECURITY MONITORING & ACTIVE EVACUATION HEADCOUNT
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportRoster}
                  className="bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Emergency Roster</span>
                </button>
                <button
                  onClick={() => { setCurrentScreen(1); navigate('/kiosk'); }}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Return to visitor kiosk"
                  aria-label="Return to visitor kiosk"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dashboard Body Content */}
            <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto">
              
              {/* Top Control Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Rapid Check-Out Bar (Columns 1 & 2) */}
                <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <LogOut className="w-4 h-4 text-blue-600" />
                      Rapid Check-Out Bar
                    </span>
                    <span className="text-[11px] text-slate-400">Instant sign-out at gate</span>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (dashCheckoutName.trim()) {
                        handleCheckOutVisitor(dashCheckoutName);
                      }
                    }}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                  >
                    <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
                      Input Name:
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Type visitor name currently inside..."
                        value={dashCheckoutName}
                        onChange={(e) => setDashCheckoutName(e.target.value)}
                        className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-3 pr-8 py-2.5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                      />
                      {dashCheckoutName && (
                        <button
                          type="button"
                          onClick={() => setDashCheckoutName('')}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={!dashCheckoutName.trim()}
                      className={`px-5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all shadow-2xs whitespace-nowrap ${
                        dashCheckoutName.trim()
                          ? 'bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] text-white cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Check-out
                    </button>
                  </form>

                  {/* Quick-select pills from current inside visitors */}
                  {activeVisitors.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-2 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-medium">Inside Now:</span>
                      {activeVisitors.slice(0, 4).map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setDashCheckoutName(v.name)}
                          className="text-[10px] bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-2 py-0.5 rounded border border-slate-200 transition-colors"
                        >
                          {v.name}
                        </button>
                      ))}
                      {activeVisitors.length > 4 && (
                        <span className="text-[10px] text-slate-400">+{activeVisitors.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Metric Card */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-xl border border-blue-200 p-4 shadow-xs flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-black text-[#1D4ED8] tracking-tight">
                      {String(activeVisitors.length).padStart(2, '0')}
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-1">
                      Active Visitors
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Currently inside premises
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded-xl shadow-xs border border-blue-200 text-blue-600">
                    <UserCheck className="w-8 h-8" />
                  </div>
                </div>

              </div>

              {/* Active Visitors Table Container */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex-1 flex flex-col overflow-hidden">
                {/* Table Header Controls */}
                <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-bold text-[#0F172A] tracking-tight">
                      Visitors currently inside
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-0.5 rounded border border-slate-200">
                      {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading visitor activity…'}
                    </span>
                  </div>

                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter active records..."
                      value={dashFilterQuery}
                      onChange={(e) => setDashFilterQuery(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Table Component */}
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                        <th className="py-3 px-4">Visitor Name</th>
                        <th className="py-3 px-4">Contact</th>
                        <th className="py-3 px-4">Purpose of Visit</th>
                        <th className="py-3 px-4">Entry Time</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                      {activeVisitorsError ? (
                        <tr>
                          <td colSpan="6" className="py-8 text-center text-red-600 text-xs" role="alert">
                            {activeVisitorsError}
                          </td>
                        </tr>
                      ) : dashboardVisitors.length > 0 ? (
                        dashboardVisitors.map((visitor) => (
                          <tr key={visitor.id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {visitor.name}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                              {visitor.contact || 'N/A'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {visitor.purpose}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                              {visitor.entryTime}
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                {visitor.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleCheckOutVisitor(visitor.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 active:bg-red-200 px-3 py-1 rounded-lg border border-red-200 transition-colors cursor-pointer"
                              >
                                Check Out
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-8 text-center text-slate-400 text-xs">
                            No active visitors found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer */}
                <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
                  <span>Displaying {dashboardVisitors.length} of {activeVisitors.length} total active records</span>
                  <button
                    onClick={async () => {
                      try {
                        const visitors = await requestApi('/api/visitors/active');
                        setActiveVisitors(visitors);
                        setLastUpdated(new Date());
                        setActiveVisitorsError('');
                        showToast('Visitor list refreshed.', 'success');
                      } catch (error) {
                        showToast(error.message, 'error');
                      }
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh visitors
                  </button>
                </div>
              </div>

            </div>

            {/* Dashboard Footer */}
            <div className="bg-white border-t border-[#E2E8F0] px-6 py-2.5 flex justify-between items-center text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-600" />
                VisitorLog Security Operations Console • Authorized Security Personnel Only
              </span>
              <span className="font-semibold text-slate-700">
                Gate Station 01
              </span>
            </div>
          </div>
        )}
      </main>

      {/* RAPID EXIT MODAL (Accessible from Kiosk Screen 1) */}
      {rapidExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-scaleIn">
            <div className="bg-[#1D4ED8] p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <LogOut className="w-5 h-5 text-blue-200" />
                <h3 className="font-bold text-sm tracking-wide uppercase">Rapid Exit / Check-Out</h3>
              </div>
              <button
                onClick={() => setRapidExitModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-xs text-slate-600 mb-4">
                Enter your name to instantly complete your visit and check out of the building.
              </p>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rapidExitQuery.trim()) {
                    handleCheckOutVisitor(rapidExitQuery);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. Alex Morgan"
                      value={rapidExitQuery}
                      onChange={(e) => setRapidExitQuery(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                {/* Autocomplete suggestions from currently inside visitors */}
                {rapidExitQuery.trim().length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 max-h-36 overflow-y-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                      Matching Inside Visitors:
                    </span>
                    {activeVisitors
                      .filter(v => v.name.toLowerCase().includes(rapidExitQuery.toLowerCase()))
                      .map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setRapidExitQuery(v.name)}
                          className="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-blue-100/60 flex items-center justify-between"
                        >
                          <span className="font-semibold text-slate-800">{v.name}</span>
                          <span className="text-[10px] text-blue-600">{v.purpose}</span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRapidExitModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!rapidExitQuery.trim()}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                      rapidExitQuery.trim()
                        ? 'bg-[#1D4ED8] hover:bg-[#1E40AF] active:bg-[#1E3A8A] cursor-pointer'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    Complete Check-Out
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}