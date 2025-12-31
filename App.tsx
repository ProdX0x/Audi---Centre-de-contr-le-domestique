
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  LayoutDashboard, 
  Settings, 
  Mic, 
  History,
  Sparkles,
  CalendarRange,
  AlertTriangle,
  X,
  Volume2,
  Trophy,
  TrendingUp,
  User as UserIcon,
  Palette,
  Check,
  Waves,
  Star,
  Download,
  Trash2,
  Database,
  Search,
  CheckCircle2,
  Zap,
  Upload,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, User, UserID, ViewType, Category, Frequency, MainNavType, Language, LibraryTask } from './types';
import { USERS as DEFAULT_USERS, INITIAL_TASKS, FREQUENCY_VIEWS, CATEGORY_METADATA, TRANSLATIONS, TASK_LIBRARY, FREQUENCY_LABELS } from './constants';
import TaskCard from './components/TaskCard';
import { generateHouseholdBriefing, speakSummary, unlockAudio } from './services/gemini';

const App: React.FC = () => {
  const [mainNav, setMainNav] = useState<MainNavType>('DASHBOARD');
  const [lang, setLang] = useState<Language>(() => (localStorage.getItem('audi_lang') as Language) || 'fr');
  const t = TRANSLATIONS[lang];

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('audi_users');
    return saved ? JSON.parse(saved) : DEFAULT_USERS;
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFilter, setUserFilter] = useState<UserID | null>(null);

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('audi_tasks');
    return saved ? JSON.parse(saved) : INITIAL_TASKS;
  });

  const [activeView, setActiveView] = useState<ViewType>('DAY');
  const [filterType, setFilterType] = useState<'ALL' | 'SOS'>('ALL');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [celebration, setCelebration] = useState<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const [activitySearch, setActivitySearch] = useState("");
  const [activityCategory, setActivityCategory] = useState<Category | 'ALL'>('ALL');
  const [addingTask, setAddingTask] = useState<LibraryTask | null>(null);
  const [tempAssignees, setTempAssignees] = useState<UserID[]>(['user1']);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '', category: Category.KITCHEN, frequency: Frequency.DAILY, assignedTo: ['user1'],
  });

  useEffect(() => {
    const syncRecurrence = () => {
      const now = new Date();
      let hasChanged = false;

      const updatedTasks = tasks.map(task => {
        if (!task.isDone || !task.completedAt) return task;

        const completedDate = new Date(task.completedAt);
        const diffMs = now.getTime() - completedDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        let shouldReset = false;
        
        switch (task.frequency) {
          case Frequency.DAILY:
            shouldReset = now.toDateString() !== completedDate.toDateString();
            break;
          case Frequency.WEEKLY:
            shouldReset = diffDays >= 6;
            break;
          case Frequency.MONTHLY:
            shouldReset = diffDays >= 28;
            break;
          case Frequency.QUARTERLY:
            shouldReset = diffDays >= 90;
            break;
          case Frequency.ANNUAL:
            shouldReset = diffDays >= 360;
            break;
        }

        if (shouldReset) {
          hasChanged = true;
          return {
            ...task,
            isDone: false,
            completedBy: [],
            completedAt: undefined,
            lastResetAt: now.toISOString()
          };
        }
        return task;
      });

      if (hasChanged) setTasks(updatedTasks);
    };

    syncRecurrence();
    const interval = setInterval(syncRecurrence, 60000);
    return () => clearInterval(interval);
  }, [tasks]); 

  useEffect(() => { localStorage.setItem('audi_tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('audi_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem('audi_lang', lang); }, [lang]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.isDone).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const user1Completed = tasks.filter(t => t.isDone && t.completedBy.includes('user1')).length;
    const user2Completed = tasks.filter(t => t.isDone && t.completedBy.includes('user2')).length;
    const categoryStats = Object.values(Category).map(cat => ({
      cat, total: tasks.filter(t => t.category === cat).length, done: tasks.filter(t => t.category === cat && t.isDone).length,
    }));
    return { total, completed, percentage, user1Completed, user2Completed, categoryStats };
  }, [tasks]);

  const pendingCountsByFrequency = useMemo(() => {
    const counts: Record<string, number> = { DAY: 0, WEEK: 0, MONTH: 0, QUARTER: 0, YEAR: 0 };
    tasks.forEach(task => {
      if (!task.isDone) {
        if (task.frequency === Frequency.DAILY) counts.DAY++;
        else if (task.frequency === Frequency.WEEKLY) counts.WEEK++;
        else if (task.frequency === Frequency.MONTHLY) counts.MONTH++;
        else if (task.frequency === Frequency.QUARTERLY) counts.QUARTER++;
        else if (task.frequency === Frequency.ANNUAL) counts.YEAR++;
      }
    });
    return counts;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const map: Record<ViewType, Frequency> = { DAY: Frequency.DAILY, WEEK: Frequency.WEEKLY, MONTH: Frequency.MONTHLY, QUARTER: Frequency.QUARTERLY, YEAR: Frequency.ANNUAL };
    let baseFiltered = tasks.filter(t => t.frequency === map[activeView]);
    if (filterType === 'SOS') baseFiltered = baseFiltered.filter(t => t.isSOS && !t.isDone);
    if (userFilter) baseFiltered = baseFiltered.filter(t => t.assignedTo.includes(userFilter));
    return baseFiltered;
  }, [tasks, activeView, filterType, userFilter]);

  const filteredLibrary = useMemo(() => {
    return TASK_LIBRARY.filter(item => {
      const matchSearch = item.title.toLowerCase().includes(activitySearch.toLowerCase());
      const matchCat = activityCategory === 'ALL' || item.category === activityCategory;
      return matchSearch && matchCat;
    });
  }, [activitySearch, activityCategory]);

  const handleAddTaskFromLibrary = (libTask: LibraryTask, freq: Frequency, assignees: UserID[]) => {
    if (assignees.length === 0) return;
    const task: Task = {
      id: Date.now().toString(),
      title: libTask.title,
      category: libTask.category,
      frequency: freq,
      assignedTo: assignees,
      completedBy: [],
      isSOS: false,
      dueDate: new Date().toISOString(),
      isDone: false,
      lastResetAt: new Date().toISOString()
    };
    setTasks(prev => [task, ...prev]);
    setAddingTask(null);
    triggerCelebration(window.innerWidth/2, window.innerHeight/2);
  };

  const triggerCelebration = (x: number, y: number) => {
    setCelebration({ active: true, x, y });
    setTimeout(() => setCelebration({ active: false, x: 0, y: 0 }), 1500);
  };

  const handleToggleStatus = (id: string, clientX?: number, clientY?: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextDone = !t.isDone;
        if (nextDone && clientX && clientY) triggerCelebration(clientX, clientY);
        return { ...t, isDone: nextDone, completedBy: nextDone ? [...t.assignedTo] : [], isSOS: nextDone ? false : t.isSOS, completedAt: nextDone ? new Date().toISOString() : undefined };
      }
      return t;
    }));
  };

  const handleToggleSOS = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, isSOS: !t.isSOS } : t));
  const handleUpdateAssignee = (id: string, userIds: UserID[]) => setTasks(prev => prev.map(t => t.id === id ? { ...t, assignedTo: userIds } : t));
  const handleDeleteTask = (id: string) => { 
    // La confirmation est maintenant gérée directement dans TaskCard (UI-based)
    setTasks(prev => prev.filter(t => t.id !== id)); 
  };

  const handleImportData = () => {
    try {
      const data = JSON.parse(importText);
      if (data.tasks && Array.isArray(data.tasks)) setTasks(data.tasks);
      if (data.users && Array.isArray(data.users)) setUsers(data.users);
      if (data.lang) setLang(data.lang);
      setIsImportModalOpen(false);
      setImportText("");
      alert(t.dataImported);
    } catch (e) {
      alert(t.dataImportError);
    }
  };

  const enableAudioInteraction = () => {
    if (!hasInteracted) setHasInteracted(true);
    unlockAudio().catch(console.error);
  };

  const runBriefing = async (isAuto = false) => {
    enableAudioInteraction();
    setIsAssistantLoading(true);
    try {
      const text = await generateHouseholdBriefing(tasks, users, lang, isAuto);
      if (text) {
        setIsSpeaking(true);
        await speakSummary(text, lang);
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("Briefing failed", err);
    } finally {
      setIsAssistantLoading(false);
      setIsSpeaking(false);
    }
  };

  const handleCreateTask = () => {
    if (!newTask.title) return;
    const task: Task = { id: Date.now().toString(), title: newTask.title!, category: (newTask.category || Category.KITCHEN) as Category, frequency: (newTask.frequency || Frequency.DAILY) as Frequency, assignedTo: (newTask.assignedTo || ['user1']) as UserID[], completedBy: [], isSOS: false, dueDate: new Date().toISOString(), isDone: false, lastResetAt: new Date().toISOString() };
    setTasks(prev => [task, ...prev]);
    setIsModalOpen(false);
    setNewTask({ title: '', category: Category.KITCHEN, frequency: Frequency.DAILY, assignedTo: ['user1'] });
  };

  const toggleTempAssignee = (uid: UserID) => {
    setTempAssignees(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingUser) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingUser({ ...editingUser, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const saveEditedUser = () => {
    if (editingUser) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
      setEditingUser(null);
    }
  };

  const NavItems = [
    { id: 'DASHBOARD', icon: LayoutDashboard, label: t.dashboard },
    { id: 'ACTIVITIES', icon: Sparkles, label: t.activities },
    { id: 'HISTORY', icon: History, label: t.history },
    { id: 'SETTINGS', icon: Settings, label: t.settings }
  ];

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-screen overflow-hidden bg-slate-50 relative font-sans text-slate-900" onClick={enableAudioInteraction}>
      <AnimatePresence>
        {celebration.active && (
          <div className="fixed inset-0 pointer-events-none z-[300]">
            {[...Array(20)].map((_, i) => (
              <motion.div key={i} initial={{ opacity: 1, scale: 0, x: celebration.x, y: celebration.y }} animate={{ opacity: 0, scale: 2, x: celebration.x + (Math.random() - 0.5) * 800, y: celebration.y + (Math.random() - 0.5) * 800, rotate: Math.random() * 720 }} transition={{ duration: 1.5, ease: "easeOut" }} className="absolute">
                <Star className="w-8 h-8 text-yellow-400 fill-current drop-shadow-lg" />
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!hasInteracted && (
          <motion.div exit={{ opacity: 0 }} className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-6">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={enableAudioInteraction} className="bg-white p-8 sm:p-12 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 max-w-sm text-center">
              <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shadow-inner border-2 border-indigo-100">
                <Volume2 className="w-12 h-12" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 mb-2">{t.welcome}</h2>
                <p className="text-slate-500 font-medium leading-relaxed">{t.activateVoice}</p>
              </div>
              <div className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl hover:bg-slate-800 transition-colors">{t.enter}</div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <aside className="hidden md:flex flex-col w-20 lg:w-64 bg-white border-r border-slate-200 py-6 px-4 shrink-0 z-20">
        <div className="flex items-center gap-3 px-2 mb-10 cursor-pointer transition-transform hover:scale-105" onClick={() => { setMainNav('DASHBOARD'); setUserFilter(null); }}>
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-black tracking-tighter hidden lg:block text-slate-900">Audi</h1>
        </div>

        <nav className="flex-1 space-y-2">
          {NavItems.map((item) => (
            <button key={item.id} onClick={() => setMainNav(item.id as MainNavType)} className={`flex items-center gap-3 w-full p-3 rounded-xl font-bold transition-all ${mainNav === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="hidden lg:block text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-6">
          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200">
             <button onClick={() => setLang('fr')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${lang === 'fr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:bg-slate-200'}`}>FR</button>
             <button onClick={() => setLang('en')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${lang === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:bg-slate-200'}`}>EN</button>
          </div>
          <div className="space-y-3">
            {users.map(user => {
              const isActive = userFilter === user.id;
              return (
                <button 
                  key={user.id} 
                  onClick={() => {
                    setUserFilter(isActive ? null : user.id);
                    setMainNav('DASHBOARD');
                  }}
                  className={`flex items-center gap-3 w-full p-2 rounded-2xl transition-all duration-300 border-2 text-left ${
                    isActive 
                      ? 'bg-indigo-50 shadow-md border-indigo-200' 
                      : 'hover:bg-slate-100 border-transparent opacity-80'
                  }`}
                  style={{ borderLeftColor: isActive ? user.color : 'transparent' }}
                >
                  <div className="relative shrink-0">
                    <img src={user.avatar} className={`w-8 h-8 rounded-full border-2 border-white shadow-sm object-cover transition-transform ${isActive ? 'scale-110' : ''}`} alt={user.name} />
                    {isActive && (
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm border border-white">
                        <Check className="w-2 h-2" />
                      </div>
                    )}
                  </div>
                  <div className="hidden lg:block overflow-hidden">
                    <p className={`text-xs font-black truncate leading-none mb-0.5 ${isActive ? 'text-indigo-900' : 'text-slate-800'}`}>{user.name}</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: user.color}} />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{t.member}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <div className="md:hidden w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-none">
                {mainNav === 'DASHBOARD' ? t.hello : mainNav === 'HISTORY' ? t.historyStats : mainNav === 'ACTIVITIES' ? t.activitiesTitle : t.householdSettings}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                 <CalendarRange className="w-3 h-3 text-indigo-500" />
                 <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest">
                  {new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' })}
                 </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="md:hidden flex -space-x-2 mr-1">
              {users.map(user => (
                <button 
                  key={user.id} 
                  onClick={() => {
                    const isActive = userFilter === user.id;
                    setUserFilter(isActive ? null : user.id);
                    setMainNav('DASHBOARD');
                  }}
                  className={`relative transition-all ${userFilter === user.id ? 'scale-110 z-10' : 'opacity-60'}`}
                >
                  <img src={user.avatar} className={`w-7 h-7 rounded-full border-2 object-cover shadow-sm ${userFilter === user.id ? 'border-indigo-500' : 'border-white'}`} alt={user.name} />
                  {userFilter === user.id && <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 text-white rounded-full p-0.5 border border-white"><Check size={6} /></div>}
                </button>
              ))}
            </div>

            <button 
              onClick={() => runBriefing(false)} 
              disabled={isAssistantLoading} 
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border-2 transition-all ${isSpeaking ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-100 shadow-lg' : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100'}`}
            >
              {isSpeaking ? <Waves className="w-4 h-4 animate-pulse" /> : <Mic className={`w-4 h-4 ${isAssistantLoading ? 'animate-pulse' : ''}`} />}
              <span className="hidden sm:block text-[10px] font-black uppercase tracking-widest">Briefing</span>
            </button>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-black shadow-lg hover:bg-slate-800 transition-all active:scale-95 text-[10px] sm:text-xs uppercase tracking-widest">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:block">{t.newTask}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-32 md:pb-8">
          <AnimatePresence mode="wait">
            {mainNav === 'DASHBOARD' ? (
              <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6 max-w-[1600px] mx-auto">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                  <div className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 shadow-sm">
                    <div className="flex flex-col min-w-[120px] text-center sm:text-left">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.todayProgress}</span>
                      <span className="text-xl font-black text-slate-800 leading-none">
                        {stats.completed}<span className="text-slate-300 mx-1">/</span>{stats.total} 
                        <span className="block text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{t.tasksCompleted}</span>
                      </span>
                    </div>
                    <div className="flex-1 w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                       <motion.div initial={{ width: 0 }} animate={{ width: `${stats.percentage}%` }} className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)]" />
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      {userFilter && (
                        <button 
                          onClick={() => setUserFilter(null)}
                          className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all shadow-sm group"
                        >
                          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: users.find(u => u.id === userFilter)?.color }} />
                          <span className="text-[9px] font-black uppercase tracking-widest">{t.filteredBy}: {users.find(u => u.id === userFilter)?.name}</span>
                          <X className="w-3 h-3 group-hover:rotate-90 transition-transform" />
                        </button>
                      )}
                      <div className="text-right">
                        <span className="text-2xl font-black text-indigo-600 leading-none">{stats.percentage}%</span>
                        <span className="block text-[9px] font-black text-slate-300 uppercase tracking-widest">{t.globalRate}</span>
                      </div>
                      {tasks.filter(t => t.isSOS && !t.isDone).length > 0 && (
                        <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl border border-red-100 animate-pulse shadow-sm">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-sm font-black leading-none">{tasks.filter(t => t.isSOS && !t.isDone).length} SOS</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="xl:col-span-4 bg-white rounded-2xl p-2 shadow-sm border border-slate-200 flex items-center justify-center">
                    <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
                      {FREQUENCY_VIEWS.map(view => (
                        <button key={view.id} onClick={() => setActiveView(view.id as ViewType)} className={`flex-1 min-w-[60px] flex flex-col items-center justify-center py-2.5 rounded-xl transition-all border-2 relative ${activeView === view.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>
                          <div className="relative">
                            {React.cloneElement(view.icon as React.ReactElement<any>, { className: "w-4 h-4 mb-1" })}
                            {pendingCountsByFrequency[view.id] > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white">{pendingCountsByFrequency[view.id]}</span>}
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-tighter truncate w-full text-center leading-none">{view.labels[lang]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {filteredTasks.filter(t => !t.isDone).map(task => (
                    <TaskCard key={task.id} task={task} users={users} lang={lang} onToggleStatus={handleToggleStatus} onToggleSOS={handleToggleSOS} onUpdateAssignee={handleUpdateAssignee} onDelete={handleDeleteTask} />
                  ))}
                </div>
              </motion.div>
            ) : mainNav === 'ACTIVITIES' ? (
              <motion.div key="activities" className="space-y-6 max-w-7xl mx-auto">
                <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-200 space-y-6">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input type="text" placeholder={t.activitiesSearch} value={activitySearch} onChange={(e) => setActivitySearch(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600 focus:bg-white transition-all text-sm" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setActivityCategory('ALL')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 ${activityCategory === 'ALL' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>ALL</button>
                      {Object.keys(CATEGORY_METADATA).map(cat => (
                        <button key={cat} onClick={() => setActivityCategory(cat as Category)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${activityCategory === cat ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-transparent text-slate-400 hover:bg-slate-100'}`}>
                          <span className="w-3.5 h-3.5">{React.cloneElement(CATEGORY_METADATA[cat as Category].icon, { className: 'w-full h-full' })}</span>
                          <span className="hidden sm:inline">{CATEGORY_METADATA[cat as Category].labels[lang]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredLibrary.map(item => (
                      <motion.div key={item.id} className="bg-white border-2 border-slate-50 rounded-2xl p-4 flex flex-col hover:border-indigo-100 transition-all group relative overflow-hidden">
                        <div className="flex justify-between items-start mb-3">
                          <div className={`p-2.5 rounded-xl ${CATEGORY_METADATA[item.category].color}`}>
                            {React.cloneElement(CATEGORY_METADATA[item.category].icon as React.ReactElement<any>, { className: "w-5 h-5" })}
                          </div>
                        </div>
                        <h4 className="font-black text-slate-800 text-sm mb-6 leading-tight flex-1">{item.title}</h4>
                        <button onClick={() => { setAddingTask(item); setTempAssignees(['user1']); }} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:bg-indigo-600">{t.addToBoard}</button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : mainNav === 'HISTORY' ? (
              <motion.div key="hist" className="space-y-6 max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {users.map(user => (
                    <div key={user.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                       <img src={user.avatar} className="w-16 h-16 rounded-full border-4 object-cover" style={{ borderColor: user.color }} alt="" />
                       <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user.name}</p>
                          <p className="text-xl font-black text-slate-800">{user.id === 'user1' ? stats.user1Completed : stats.user2Completed} <span className="text-xs text-slate-400 font-bold uppercase">{t.tasksCompleted}</span></p>
                       </div>
                    </div>
                  ))}
                  <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl flex flex-col items-center justify-center text-white">
                      <span className="text-2xl font-black">{stats.percentage}%</span>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{t.householdState}</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 text-sm uppercase tracking-[0.1em]">{t.lastCompleted}</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {tasks.filter(t => t.isDone).sort((a,b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 15).map(task => (
                      <div key={task.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-xl ${CATEGORY_METADATA[task.category].color}`}>{React.cloneElement(CATEGORY_METADATA[task.category].icon as React.ReactElement<any>, { className: "w-4 h-4" })}</div>
                          <div>
                            <h4 className="font-black text-slate-800 text-sm">{task.title}</h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(task.completedAt || '').toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})}</p>
                          </div>
                        </div>
                        <div className="flex -space-x-2">
                          {task.completedBy.map(uid => <img key={uid} src={users.find(u => u.id === uid)?.avatar} className="w-7 h-7 rounded-full border-2 border-white object-cover shadow-sm" alt="" />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="sett" className="max-w-2xl mx-auto space-y-8 pb-10">
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {users.map(user => (
                    <div key={user.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col items-center text-center">
                      <div className="relative mb-4">
                        <img src={user.avatar} className="w-20 h-20 rounded-full border-4 object-cover" style={{ borderColor: user.color }} alt="" />
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white" style={{backgroundColor: user.color}} />
                      </div>
                      <h3 className="text-lg font-black text-slate-800 mb-4">{user.name}</h3>
                      <button onClick={() => setEditingUser(user)} className="w-full bg-slate-100 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">{t.personalize}</button>
                    </div>
                  ))}
                </section>
                <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                   <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{t.system}</h2>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button onClick={() => { navigator.clipboard.writeText(JSON.stringify({tasks, users, lang}, null, 2)); alert(t.dataExported); }} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-indigo-100 transition-all"><Download size={18}/> {t.exportData}</button>
                      <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-emerald-100 transition-all"><Upload size={18}/> {t.importData}</button>
                      <button onClick={() => { if (window.confirm(t.confirmReset)) { setTasks(INITIAL_TASKS); setUsers(DEFAULT_USERS); localStorage.clear(); window.location.reload(); }}} className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-transparent hover:border-red-100 text-red-600 transition-all col-span-full"><Trash2 size={18}/> {t.resetData}</button>
                   </div>
                </section>
                <section className="md:hidden bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Langue / Language</h2>
                  <div className="flex gap-2">
                    <button onClick={() => setLang('fr')} className={`flex-1 py-3 rounded-xl font-black uppercase text-xs ${lang === 'fr' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>Français</button>
                    <button onClick={() => setLang('en')} className={`flex-1 py-3 rounded-xl font-black uppercase text-xs ${lang === 'en' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>English</button>
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-200 px-6 py-4 flex justify-between items-center z-[100] shadow-2xl">
        {NavItems.map((item) => (
          <button 
            key={item.id} 
            onClick={() => setMainNav(item.id as MainNavType)} 
            className={`flex flex-col items-center gap-1.5 transition-all ${mainNav === item.id ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}
          >
            <item.icon className={`w-6 h-6 ${mainNav === item.id ? 'drop-shadow-[0_0_8px_rgba(79,70,229,0.3)]' : ''}`} />
            <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-[800] flex items-center justify-center p-4">
            <div onClick={() => setEditingUser(null)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 flex flex-col items-center gap-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.editProfile}</h3>
              <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <img src={editingUser.avatar} className="w-28 h-28 rounded-full border-4 object-cover" style={{ borderColor: editingUser.color }} alt="" />
                <div className="absolute inset-0 bg-black/20 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><Camera className="text-white" /></div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              </div>
              <div className="w-full space-y-4">
                <input type="text" value={editingUser.name} onChange={(e) => setEditingUser({...editingUser, name: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3 text-sm font-black outline-none focus:border-indigo-600" />
                <div className="flex justify-between p-2 bg-slate-50 rounded-2xl border-2 border-slate-100">
                  {['#0EA5E9', '#D946EF', '#10B981', '#F59E0B', '#EF4444', '#6366F1'].map(c => (
                    <button key={c} onClick={() => setEditingUser({...editingUser, color: c})} className={`w-7 h-7 rounded-full border-2 transition-all ${editingUser.color === c ? 'border-slate-900 scale-110' : 'border-white'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 w-full">
                <button onClick={() => setEditingUser(null)} className="flex-1 py-4 font-black uppercase tracking-widest text-[10px] text-slate-400">{t.cancel}</button>
                <button onClick={saveEditedUser} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl">{t.save}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <div onClick={() => setIsImportModalOpen(false)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-lg bg-white rounded-[32px] p-8 flex flex-col gap-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.importData}</h3>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={t.importPlaceholder} className="w-full h-64 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-xs outline-none focus:border-indigo-600 transition-all resize-none" />
              <div className="flex gap-3">
                <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 font-black uppercase tracking-widest text-[10px] text-slate-400">{t.cancel}</button>
                <button onClick={handleImportData} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl">{t.save}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addingTask && (
          <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
            <div onClick={() => setAddingTask(null)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 flex flex-col gap-8">
              <div className="text-center">
                <div className={`w-20 h-20 mx-auto rounded-[30px] flex items-center justify-center mb-4 ${CATEGORY_METADATA[addingTask.category].color}`}>
                  {React.cloneElement(CATEGORY_METADATA[addingTask.category].icon as React.ReactElement<any>, { className: "w-10 h-10" })}
                </div>
                <h3 className="text-xl font-black text-slate-800 leading-tight">{addingTask.title}</h3>
              </div>
              <div className="space-y-6">
                <div className="flex justify-center gap-4">
                  {users.map(user => (
                    <button key={user.id} onClick={() => toggleTempAssignee(user.id)} className={`relative w-14 h-14 rounded-full border-4 transition-all ${tempAssignees.includes(user.id) ? 'scale-110' : 'opacity-40 grayscale'}`} style={{ borderColor: tempAssignees.includes(user.id) ? user.color : 'white' }}>
                      <img src={user.avatar} className="w-full h-full rounded-full object-cover" alt="" />
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(Frequency).map(freq => (
                    <button key={freq} disabled={tempAssignees.length === 0} onClick={() => handleAddTaskFromLibrary(addingTask, freq, tempAssignees)} className="p-3 rounded-2xl bg-slate-50 font-black text-[10px] uppercase tracking-tighter text-slate-500 hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-20">{FREQUENCY_LABELS[freq][lang]}</button>
                  ))}
                </div>
                <button onClick={() => setAddingTask(null)} className="w-full text-slate-400 font-black text-xs uppercase tracking-widest">{t.cancel}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
            <div onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 space-y-6">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{t.newTask}</h2>
              <input type="text" value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} placeholder={t.taskPlaceholder} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-black outline-none focus:border-indigo-600 text-sm" />
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(CATEGORY_METADATA).map(([key, meta]) => (
                  <button key={key} onClick={() => setNewTask({...newTask, category: key as Category})} className={`flex flex-col items-center gap-2 p-2 rounded-2xl border-2 transition-all ${newTask.category === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-slate-50'}`}>
                    <div className={`p-2 rounded-xl ${newTask.category === key ? 'bg-white/20' : meta.color}`}>{React.cloneElement(meta.icon as React.ReactElement<any>, { className: "w-5 h-5" })}</div>
                    <span className="text-[7px] sm:text-[8px] font-black uppercase text-center truncate w-full">{meta.labels[lang]}</span>
                  </button>
                ))}
              </div>
              <button disabled={!newTask.title} onClick={handleCreateTask} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all disabled:opacity-20 text-xs">{t.addTask}</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
