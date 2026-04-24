import React, { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import AuthPage from './AuthPage';
import type { User } from '@supabase/supabase-js';

type Message = {
  role: 'user' | 'agent';
  content: string;
  actions?: string[];
  isThinking?: boolean;
};

type Task = {
  id: string;
  title: string;
  skill: string;
  source: string;
  status: string;
  created_at: string;
};

type ScheduledTask = {
  id: string;
  title: string;
  scheduled_time: string;
  reminded: boolean;
  chat_id: string;
  created_at: string;
};

type WeatherData = {
  temp: number;
  description: string;
  iconUrl: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: 'BrainSync Online.\nReady to execute commands.' }
  ]);
  const [input, setInput] = useState('');
  const [dbTasks, setDbTasks] = useState<Task[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [spotifyPlaylistId, setSpotifyPlaylistId] = useState('37i9dQZF1DXcBWIGoYBM5M');
  const [telegramStatus, setTelegramStatus] = useState({ isLinked: false, code: '' });
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auth: check session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setSessionLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch Live Weather
  useEffect(() => {
    if (!user) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const apiKey = '9c6ed946b818ba68e35774cb5c538b91';
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`);
            const data = await res.json();
            
            if (data && data.main) {
              setWeather({
                temp: Math.round(data.main.temp),
                description: data.weather[0].main,
                iconUrl: `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`
              });
            }
          } catch (e) {
            console.error("Failed to fetch weather", e);
          }
        },
        (error) => {
          console.error("Geolocation error", error);
        }
      );
    }
  }, [user]);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages, isChatOpen]);

  // Live Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/tasks/history');
      const data = await res.json();
      if (data.tasks) setDbTasks(data.tasks);
    } catch (e) { /* silent */ }
  };

  const fetchScheduledTasks = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/tasks/scheduled');
      const data = await res.json();
      if (data.tasks) setScheduledTasks(data.tasks);
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    fetchTasks();
    fetchScheduledTasks();
    const interval = setInterval(fetchTasks, 3000);
    const schedInterval = setInterval(fetchScheduledTasks, 3000);
    return () => { clearInterval(interval); clearInterval(schedInterval); };
  }, []);

  // Fetch initial config
  useEffect(() => {
    fetch('http://localhost:3001/api/config')
      .then(r => r.json())
      .then(d => {
        if (d.spotify_playlist_id) setSpotifyPlaylistId(d.spotify_playlist_id);
      })
      .catch(() => {});
  }, []);

  const completeTask = async (taskId: string, taskTitle: string) => {
    try {
      await fetch('http://localhost:3001/api/schedule/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, title: taskTitle })
      });
      fetchScheduledTasks();
      fetchTasks();
    } catch (e) { console.error(e); }
  };

  const cancelTask = async (taskId: string, taskTitle: string) => {
    try {
      await fetch('http://localhost:3001/api/schedule/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, title: taskTitle })
      });
      fetchScheduledTasks();
      fetchTasks();
    } catch (e) { console.error(e); }
  };

  // Poll Telegram status
  useEffect(() => {
    if (!user) return;
    const checkStatus = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/telegram/status?user_id=web_user_1');
        const data = await res.json();
        setTelegramStatus(prev => ({ ...prev, isLinked: data.is_linked }));
      } catch(e) {}
    };
    checkStatus();
    const int = setInterval(checkStatus, 5000);
    return () => clearInterval(int);
  }, [user]);

  const generatePairingCode = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/telegram/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'web_user_1' })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setTelegramStatus(prev => ({ ...prev, code: data.code }));
      }
    } catch(e) {
      alert('Failed to generate code.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userPrompt = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userPrompt }]);
    setMessages(prev => [...prev, { role: 'agent', content: '', isThinking: true }]);

    try {
      const response = await fetch('http://localhost:3001/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt }),
      });
      const data = await response.json();
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs.pop();
        return [...newMsgs, {
          role: 'agent',
          content: data.message || data.content || 'Action completed.',
          actions: data.actions_taken || data.setup_actions || []
        }];
      });
      setTimeout(fetchTasks, 1000);
      setTimeout(fetchScheduledTasks, 1000);
    } catch {
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs.pop();
        return [...newMsgs, { role: 'agent', content: 'NETWORK ERROR: Uplink failed.' }];
      });
    }
  };

  // Stats calculation
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    let todayCount = 0;
    let completedCount = 0;
    
    dbTasks.forEach(t => {
      const d = new Date(t.created_at);
      d.setHours(0,0,0,0);
      if (d.getTime() === today.getTime()) todayCount++;
      if (t.status === 'completed') completedCount++;
    });

    return {
      today: todayCount,
      completed: completedCount,
      total: dbTasks.length
    };
  }, [dbTasks]);

  // Calendar generation (simple view for current month)
  const renderCalendar = () => {
    const date = new Date(currentTime);
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Indian events mapping (Month is 0-indexed)
    const indianEvents: Record<number, Record<number, string>> = {
      0: { 1: 'New Year', 14: 'Makar Sankranti', 26: 'Republic Day' },
      2: { 4: 'Holi', 24: 'Maha Shivaratri' },
      3: { 2: 'Mahavir Jayanti', 3: 'Good Friday', 14: 'Vaisakhi / Baisakhi', 20: 'Eid-ul-Fitr' },
      4: { 1: 'Labour Day', 31: 'Buddha Purnima' },
      7: { 15: 'Independence Day', 28: 'Janmashtami' },
      8: { 15: 'Ganesh Chaturthi' },
      9: { 2: 'Gandhi Jayanti', 18: 'Dussehra' },
      10: { 8: 'Diwali', 10: 'Bhai Dooj' },
      11: { 25: 'Christmas' }
    };
    
    const currentMonthEvents = indianEvents[month] || {};

    // Group scheduled tasks by date for the current month
    const scheduledEvents: Record<number, string[]> = {};
    scheduledTasks.forEach(task => {
      const taskDate = new Date(task.scheduled_time);
      if (taskDate.getFullYear() === year && taskDate.getMonth() === month) {
        const d = taskDate.getDate();
        if (!scheduledEvents[d]) scheduledEvents[d] = [];
        scheduledEvents[d].push(task.title);
      }
    });

    const days = [];
    const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="min-h-[100px] p-2 border border-[#111]"></div>);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = d === date.getDate();
      const eventName = currentMonthEvents[d];
      const dayTasks = scheduledEvents[d] || [];
      
      days.push(
        <div key={`day-${d}`} className={`min-h-[100px] p-2 border border-[#111] transition-colors hover:bg-[#111] flex flex-col ${isToday ? 'bg-[#0a0a0a]' : ''}`}>
          <span className={`text-xs font-mono mb-1.5 ${isToday ? 'text-[#00e5ff] font-bold' : 'text-gray-500'}`}>{d}</span>
          
          <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar pr-1">
            {eventName && (
              <div className="px-1.5 py-0.5 rounded bg-[#ff8c00]/10 border border-[#ff8c00]/30 shadow-[0_0_5px_rgba(255,140,0,0.1)] truncate">
                <span className="text-[9px] text-[#ff8c00] font-bold tracking-wide flex items-center gap-1">
                  <span className="text-[8px]">★</span> {eventName}
                </span>
              </div>
            )}
            {dayTasks.map((title, idx) => (
              <div key={idx} className="px-1.5 py-0.5 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/30 shadow-[0_0_5px_rgba(0,229,255,0.1)] truncate" title={title}>
                <span className="text-[9px] text-[#00e5ff] font-bold tracking-wide flex items-center gap-1">
                  <span className="text-[8px]">⚡</span> {title}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#050505] border border-gray-800 rounded-xl overflow-hidden mt-6">
        <div className="flex justify-between items-center p-4 border-b border-[#111]">
          <button className="text-gray-500 hover:text-white">&lt;</button>
          <h3 className="text-sm font-bold text-gray-300 font-mono tracking-widest">{date.toLocaleString('default', { month: 'long' })} {year}</h3>
          <button className="text-gray-500 hover:text-white">&gt;</button>
        </div>
        <div className="grid grid-cols-7 border-b border-[#111]">
          {weekDays.map(wd => (
            <div key={wd} className="text-center py-2 text-[10px] text-gray-600 font-mono tracking-widest border-r border-[#111] last:border-0">{wd}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days}
        </div>
      </div>
    );
  };

  const navItems = [
    { icon: '⌘', label: 'Dashboard' },
    { icon: '⚡', label: 'Tasks' },
    { icon: '🎵', label: 'Music' },
  ];

  // Auth guard
  if (sessionLoading) {
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center">
        <div className="text-[#00e5ff] font-mono text-sm animate-pulse tracking-widest">INITIALIZING BRAINSYNC...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthSuccess={() => {}} />;
  }

  const userDisplayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Commander';
  const userEmail = user.email || '';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  return (
    <div className="flex w-full h-full bg-[#050505] text-[#e0e0e0] font-sans overflow-hidden fixed inset-0">
      
      {/* LEFT SIDEBAR */}
      <div className="w-[240px] border-r border-gray-800 bg-[#020202] flex flex-col flex-shrink-0">
        
        {/* Workspace Header with User Profile */}
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00e5ff]/20 to-[#bf00ff]/20 border border-[#00e5ff]/30 flex items-center justify-center text-[#00e5ff] font-bold text-sm shadow-[0_0_10px_rgba(0,229,255,0.1)] flex-shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[13px] font-bold text-white tracking-wide truncate">{userDisplayName}</h1>
              <p className="text-[10px] text-gray-600 font-mono truncate">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4">
          <div className="space-y-1 px-3">
            {navItems.map(item => (
              <div key={item.label} onClick={() => setActiveTab(item.label)} className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 ${activeTab === item.label ? 'bg-white text-black font-semibold' : 'text-gray-400 hover:bg-[#111] hover:text-white'}`}>
                <span className={`text-lg leading-none ${activeTab === item.label ? 'text-black' : 'text-gray-500'}`}>{item.icon}</span>
                <span className="text-[13px] tracking-wide">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Telegram Pairing */}
        <div className="p-4 border-t border-gray-800">
          <div className="bg-[#111] rounded-lg p-3 border border-gray-800 shadow-inner">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="text-[#00e5ff]">📱</span> Telegram Link
            </h3>
            {telegramStatus.isLinked ? (
              <div className="flex items-center gap-2 text-[#00ff80] text-xs font-mono bg-[#00ff80]/10 border border-[#00ff80]/20 px-3 py-2 rounded-md">
                <span className="w-2 h-2 rounded-full bg-[#00ff80] animate-pulse shadow-[0_0_8px_#00ff80]"></span>
                Connected
              </div>
            ) : telegramStatus.code ? (
              <div className="text-xs">
                <p className="text-gray-400 mb-2 leading-tight">Send this code to <br/><span className="text-white font-semibold">@BrainSyncAppBot</span> on Telegram:</p>
                <code className="block bg-[#000] border border-[#00e5ff]/30 text-[#00e5ff] px-2 py-2 rounded font-mono text-center tracking-widest font-bold text-sm shadow-[0_0_10px_rgba(0,229,255,0.1)]">
                  /connect {telegramStatus.code}
                </code>
              </div>
            ) : (
              <button 
                onClick={generatePairingCode}
                className="w-full text-[11px] bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/20 py-2 rounded transition-colors font-bold tracking-wide uppercase"
              >
                Connect Account
              </button>
            )}
          </div>
        </div>

        {/* Sign Out */}
        <div className="p-5 border-t border-gray-800">
          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full flex items-center gap-3 text-red-500 cursor-pointer hover:text-red-400 transition-colors px-2 py-2 rounded-lg hover:bg-red-900/10"
          >
            <span>⎋</span>
            <span className="text-[13px] font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative">
        
        {/* Top Header */}
        <div className="h-[70px] border-b border-gray-800 px-8 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-white tracking-wide">{activeTab}</h2>
          <div className="flex items-center gap-4 text-[12px] text-gray-400 font-mono">
            <span>{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <button className="hover:text-white transition-colors">⚙</button>
          </div>
        </div>

        {/* Dashboard Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          
          {activeTab === 'Dashboard' ? (
            <>
              {/* Greeting */}
              <div className="mb-8">
                <div className="flex items-center gap-6 flex-wrap">
                  <h1 className="text-4xl font-bold text-white tracking-tight flex items-baseline gap-3">
                    Good afternoon, <span className="text-[#bf00ff] neon-glow-text">{userDisplayName}</span>
                  </h1>
                  {weather && (
                    <div className="flex items-center gap-3 bg-[#0a0a0a] border border-gray-800 rounded-xl px-3 py-1 shadow-[0_0_15px_rgba(0,255,128,0.1)]">
                      <img src={weather.iconUrl} alt={weather.description} className="w-8 h-8 opacity-90" />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#00ff80] font-mono leading-none">{weather.temp}°C</span>
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest leading-none mt-1">{weather.description}</span>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            const res = await fetch('http://localhost:3001/api/send-alert', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ weather_desc: weather.description, temp: weather.temp })
                            });
                            const data = await res.json();
                            if (data.status === 'success') {
                              alert('Alert sent to Telegram!');
                            } else {
                              alert('Failed to send alert.');
                            }
                          } catch (e) {
                            alert('Network error.');
                          }
                        }}
                        className="ml-2 bg-[#111] hover:bg-[#222] border border-gray-700 rounded p-1.5 transition-colors"
                        title="Send Test Weather Alert to Telegram"
                      >
                        <svg className="w-4 h-4 text-[#00ff80]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-gray-500 font-mono text-[11px] mt-3 flex items-center gap-2">
                  <span className="text-gray-400">◷</span>
                  {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} • {currentTime.toLocaleTimeString()}
                </p>
              </div>

              {/* 4 Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 border-l-4 border-l-[#00e5ff] shadow-[inset_4px_0_15px_rgba(0,229,255,0.05)]">
                  <h3 className="text-2xl font-bold text-[#00e5ff] font-mono mb-2">{stats.today}</h3>
                  <p className="text-[13px] font-bold text-white tracking-wide">Today's Tasks</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-1">Pending Sync</p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 border-l-4 border-l-[#00ff80] shadow-[inset_4px_0_15px_rgba(0,255,128,0.05)]">
                  <h3 className="text-2xl font-bold text-[#00ff80] font-mono mb-2">{stats.completed}</h3>
                  <p className="text-[13px] font-bold text-white tracking-wide">Completed</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-1">Total Verified</p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 border-l-4 border-l-[#ff8c00] shadow-[inset_4px_0_15px_rgba(255,140,0,0.05)]">
                  <h3 className="text-2xl font-bold text-[#ff8c00] font-mono mb-2">{stats.total}</h3>
                  <p className="text-[13px] font-bold text-white tracking-wide">Total History</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-1">All Operations</p>
                </div>
                
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 border-l-4 border-l-[#ff00ff] shadow-[inset_4px_0_15px_rgba(255,0,255,0.05)]">
                  <h3 className="text-2xl font-bold text-[#ff00ff] font-mono mb-2">1</h3>
                  <p className="text-[13px] font-bold text-white tracking-wide">Active Agents</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-1">BrainSync Online</p>
                </div>
              </div>

              {/* Upcoming Schedule */}
              {scheduledTasks.length > 0 && (
                <div className="mt-8 mb-6">
                  <h2 className="text-sm font-bold text-white tracking-widest uppercase font-mono mb-4 flex items-center gap-2">
                    <span className="text-[#00e5ff]">⏰</span> Upcoming Schedule
                    <span className="ml-2 text-[10px] text-gray-600 font-normal">— 20-min reminders via Telegram</span>
                  </h2>
                  <div className="space-y-3">
                    {scheduledTasks.map((task) => {
                      const taskTime = new Date(task.scheduled_time);
                      const now = new Date();
                      const diffMs = taskTime.getTime() - now.getTime();
                      const diffMin = Math.round(diffMs / 60000);
                      const isPast = diffMs < 0;
                      const isSoon = diffMin <= 20 && diffMin > 0;
                      const timeStr = taskTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                      return (
                        <div key={task.id} className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all ${
                          isPast
                            ? 'bg-[#0a0a0a] border-gray-800 opacity-50'
                            : isSoon
                            ? 'bg-[#fff700]/5 border-[#fff700]/30 shadow-[0_0_20px_rgba(255,247,0,0.05)]'
                            : 'bg-[#0a0a0a] border-gray-800 hover:border-[#00e5ff]/30'
                        }`}>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isPast ? 'bg-gray-700' : isSoon ? 'bg-[#fff700] shadow-[0_0_8px_#fff700] animate-pulse' : 'bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.5)]'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{task.title}</p>
                            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                              {isPast ? 'Started' : 'Starts at'} {timeStr}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {!isPast && (
                              <span className={`text-[11px] font-mono font-bold px-2 py-1 rounded-md ${
                                isSoon ? 'bg-[#fff700]/10 text-[#fff700]' : 'bg-[#00e5ff]/10 text-[#00e5ff]'
                              }`}>
                                {isSoon ? `🔔 in ${diffMin}m` : diffMin < 60 ? `in ${diffMin}m` : `in ${Math.round(diffMin/60)}h`}
                              </span>
                            )}
                            {isPast && <span className="text-[11px] font-mono text-gray-600">Started</span>}
                          </div>
                          {task.reminded && (
                            <span className="text-[10px] text-[#00ff80] font-mono">✓ Reminded</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Calendar */}
              {renderCalendar()}
            </>
          ) : (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-3 mb-6">
                <span className="text-[#bf00ff] neon-glow-text">Telegram Tasks</span>
              </h1>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pending Tasks */}
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center bg-[#111]">
                    <h3 className="text-sm font-bold text-[#ff8c00] font-mono tracking-widest uppercase flex items-center gap-2">
                      <span>⏳</span> Pending
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {scheduledTasks.length === 0 && (
                      <div className="p-8 text-center text-gray-500 font-mono text-sm">No pending tasks.</div>
                    )}
                    {scheduledTasks.map((task) => {
                      const taskTime = new Date(task.scheduled_time);
                      return (
                        <div key={task.id} className="p-5 flex items-center justify-between hover:bg-[#111]/50 transition-colors">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm font-semibold text-white mb-1 leading-snug">{task.title}</p>
                            <div className="flex items-center gap-3 text-xs font-mono text-[#00e5ff]">
                              <span className="flex items-center gap-1"><span className="text-gray-600">◷</span> {taskTime.toLocaleDateString()} {taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => completeTask(task.id, task.title)}
                              className="bg-[#00ff80]/10 hover:bg-[#00ff80]/20 text-[#00ff80] border border-[#00ff80]/30 rounded-md px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center gap-2"
                              title="Mark as Completed"
                            >
                              <span>✓</span> Complete
                            </button>
                            <button
                              onClick={() => cancelTask(task.id, task.title)}
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-md px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase transition-colors flex items-center gap-2"
                              title="Cancel Task"
                            >
                              <span>✕</span> Cancel
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Completed Tasks */}
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                  <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center bg-[#111]">
                    <h3 className="text-sm font-bold text-[#00ff80] font-mono tracking-widest uppercase flex items-center gap-2">
                      <span>✅</span> Completed
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {dbTasks.filter(t => t.source === 'telegram' && t.status === 'completed').length === 0 && (
                      <div className="p-8 text-center text-gray-500 font-mono text-sm">No completed tasks yet.</div>
                    )}
                    {dbTasks.filter(t => t.source === 'telegram' && t.status === 'completed').map((task) => (
                      <div key={task.id} className="p-5 flex items-center justify-between hover:bg-[#111]/50 transition-colors">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-semibold text-gray-400 mb-1 leading-snug line-through">{task.title}</p>
                          <div className="flex items-center gap-3 text-xs font-mono text-gray-600">
                            <span className="flex items-center gap-1"><span className="text-gray-700">⚡</span> {task.skill}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><span className="text-gray-700">◷</span> {new Date(task.created_at).toLocaleDateString()} {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Music' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-3 mb-6">
                <span className="text-[#00e5ff] neon-glow-text">Music Station</span>
              </h1>
              
              <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Player Embed */}
                  <div className="flex-1">
                    <iframe 
                      src={`https://open.spotify.com/embed/playlist/${spotifyPlaylistId}?utm_source=generator&theme=0`} 
                      width="100%" 
                      height="380" 
                      frameBorder="0" 
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                      loading="lazy"
                      className="rounded-xl shadow-2xl"
                    ></iframe>
                  </div>

                  {/* Settings */}
                  <div className="w-full lg:w-[300px] space-y-6">
                    <div className="bg-[#111] p-6 rounded-xl border border-gray-800">
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="text-[#00e5ff]">⚙</span> Automation Control
                      </h3>
                      <p className="text-[11px] text-gray-500 mb-6 leading-relaxed">
                        Update the Playlist ID to change both this player and your automatic wake-up music.
                      </p>
                      
                      <div className="space-y-5">
                        <div>
                          <label className="text-[9px] text-gray-500 uppercase font-bold tracking-widest block mb-2">Playlist ID</label>
                          <input 
                            type="text" 
                            value={spotifyPlaylistId}
                            onChange={(e) => setSpotifyPlaylistId(e.target.value)}
                            className="w-full bg-[#050505] border border-gray-800 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00e5ff] transition-all font-mono"
                            placeholder="e.g. 37i9dQZF1DXcBWIGoYBM5M"
                          />
                        </div>
                        
                        <button 
                          onClick={async () => {
                            try {
                              const res = await fetch('http://localhost:3001/api/config', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ spotify_playlist_id: spotifyPlaylistId })
                              });
                              if (res.ok) alert('Spotify configuration updated!');
                            } catch (e) { alert('Failed to update config.'); }
                          }}
                          className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/80 text-black font-bold py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] text-sm uppercase tracking-widest"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-[#050505]/50 border border-dashed border-gray-800 rounded-xl">
                      <p className="text-[10px] text-gray-600 leading-relaxed italic">
                        Tip: Open a playlist on Spotify, click "..." → Share → Copy link. The ID is the characters after /playlist/
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Floating Chatbot Widget (Retained) */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end">
        {isChatOpen && (
          <div className="mb-4 w-[380px] h-[550px] bg-[#0a0a0a] border border-gray-800 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-slide-up neon-border-blue">
            <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center bg-[#111]">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#00e5ff] shadow-[0_0_8px_#00e5ff] animate-pulse"></div>
                <span className="text-xs font-bold text-white tracking-widest uppercase">BRAINSYNC TERMINAL</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-[#050505]">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#111] border border-gray-800 text-gray-200 rounded-br-sm'
                      : 'bg-transparent text-[#00e5ff] font-mono'
                  }`}>
                    {msg.role === 'agent' && <span className="mr-2 opacity-50">&gt;</span>}
                    {msg.isThinking ? (
                      <span className="animate-pulse">Processing...</span>
                    ) : (
                      <>
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-800 space-y-1">
                            {msg.actions.map((act, i) => (
                              <div key={i} className="text-[10px] text-[#00ff80] flex items-start">
                                <span className="mr-2 mt-0.5">▪</span> {act}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-[#0a0a0a] border-t border-gray-800">
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter command..."
                  className="flex-1 bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-[13px] text-white focus:outline-none focus:border-[#00e5ff] transition-colors font-mono placeholder:text-gray-700"
                  autoFocus
                />
                <button type="submit" disabled={!input.trim()} className="w-11 h-11 rounded-lg bg-[#111] border border-gray-800 text-[#00e5ff] flex items-center justify-center hover:border-[#00e5ff] transition-all disabled:opacity-30 disabled:hover:border-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}

        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.3)] transition-all duration-300 hover:scale-110 ${isChatOpen ? 'bg-[#111] border-2 border-gray-800' : 'bg-[#000] neon-border-blue'}`}
        >
          {isChatOpen ? (
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-7 h-7 text-[#00e5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default App;
