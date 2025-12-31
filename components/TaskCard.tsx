
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, MoreVertical, Trash2, Check, Clock, X, AlertCircle } from 'lucide-react';
import { Task, User, UserID, Language } from '../types';
import { CATEGORY_METADATA, TRANSLATIONS } from '../constants';

interface TaskCardProps {
  task: Task;
  users: User[];
  lang: Language;
  onToggleStatus: (id: string, clientX?: number, clientY?: number) => void;
  onToggleSOS: (id: string) => void;
  onUpdateAssignee: (id: string, userIds: UserID[]) => void;
  onDelete: (id: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  users,
  lang,
  onToggleStatus, 
  onToggleSOS,
  onUpdateAssignee,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const meta = CATEGORY_METADATA[task.category];
  const t = TRANSLATIONS[lang];
  
  const isLate = useMemo(() => {
    if (task.isDone) return false;
    const now = new Date();
    const resetDate = new Date(task.lastResetAt);
    const diffDays = (now.getTime() - resetDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 3; // Indicateur 3 jours consécutifs
  }, [task.isDone, task.lastResetAt]);

  const getBackgroundColor = () => {
    if (task.isDone) return 'bg-slate-50 opacity-40';
    if (isLate) return 'bg-white border-amber-200 shadow-sm';
    return 'bg-white border-slate-200 shadow-sm hover:border-slate-300';
  };

  const getUserData = (userId: UserID) => {
    return users.find(u => u.id === userId);
  };

  const handleToggleUserAssignment = (userId: UserID) => {
    const isCurrentlyAssigned = task.assignedTo.includes(userId);
    let newAssignees: UserID[];
    
    if (isCurrentlyAssigned) {
      if (task.assignedTo.length <= 1) return;
      newAssignees = task.assignedTo.filter(id => id !== userId);
    } else {
      newAssignees = [...task.assignedTo, userId];
    }
    
    onUpdateAssignee(task.id, newAssignees);
  };

  const closeMenu = () => {
    setShowMenu(false);
    setIsConfirmingDelete(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.98 }}
      className={`relative p-3 rounded-2xl border transition-all group h-fit flex flex-col touch-auto ${getBackgroundColor()} ${task.isSOS && !task.isDone ? 'sos-pulse border-red-300' : ''}`}
      style={!task.isDone && task.assignedTo.length === 1 ? { borderLeft: `4px solid ${getUserData(task.assignedTo[0])?.color || '#cbd5e1'}` } : {}}
      role="listitem"
    >
      {/* Header compact */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`p-1.5 rounded-lg ${meta.color}`}>
            {React.cloneElement(meta.icon as React.ReactElement<any>, { className: "w-3.5 h-3.5 sm:w-4 sm:h-4" })}
          </div>
          <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[80px]">
            {meta.labels[lang]}
          </span>
          {isLate && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md animate-bounce">
              <Clock className="w-2.5 h-2.5" />
              <span className="text-[8px] font-black uppercase tracking-tighter">{t.threeDaysLate}</span>
            </div>
          )}
        </div>
        
        {task.isSOS && !task.isDone && (
          <div className="bg-red-600 text-white text-[7px] px-1.5 py-0.5 rounded-md font-black uppercase shadow-lg border-2 border-white tracking-widest">
            SOS
          </div>
        )}
      </div>

      <h3 className={`font-black text-xs sm:text-sm mb-4 leading-snug flex-1 ${task.isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </h3>
      
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2 mr-1">
            {task.assignedTo.map(uid => {
              const user = getUserData(uid);
              return (
                <div 
                  key={uid} 
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden border-2 border-white shadow-sm shrink-0"
                  style={{ backgroundColor: user?.color }}
                  title={user?.name}
                >
                  <img src={user?.avatar} className="w-full h-full object-cover" alt={user?.name} />
                </div>
              );
            })}
          </div>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(task.id, e.clientX, e.clientY);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] sm:text-[10px] font-black transition-all active:scale-90 uppercase tracking-widest ${
              task.isDone 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md'
            }`}
          >
            {task.isDone ? <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : null}
            {task.isDone ? t.done : t.finish}
          </button>
        </div>

        <div className="flex items-center gap-1">
          {!task.isDone && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onToggleSOS(task.id);
              }}
              className={`p-1.5 rounded-lg transition-colors ${task.isSOS ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 hover:text-red-400'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 text-slate-300 hover:text-slate-600 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                  }} />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-3xl shadow-2xl border border-slate-100 py-3 z-20 overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isConfirmingDelete ? (
                      <>
                        <div className="px-4 py-1 mb-2">
                          <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">{t.assign}</span>
                        </div>
                        
                        <div className="px-4 flex items-center justify-between mb-3">
                          {users.map(user => {
                            const isAssigned = task.assignedTo.includes(user.id);
                            return (
                              <motion.button
                                key={user.id}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleToggleUserAssignment(user.id)}
                                className="relative"
                              >
                                <div className={`w-10 h-10 rounded-full border-2 transition-all overflow-hidden ${isAssigned ? 'shadow-md scale-105' : 'grayscale opacity-40 scale-90'}`} style={{ borderColor: isAssigned ? user.color : 'transparent' }}>
                                  <img src={user.avatar} className="w-full h-full object-cover" alt={user.name} />
                                </div>
                                {isAssigned && (
                                  <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-slate-50">
                                    <div className="rounded-full p-0.5" style={{ backgroundColor: user.color }}>
                                      <Check className="w-2 h-2 text-white" />
                                    </div>
                                  </div>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>

                        <div className="border-t border-slate-50 pt-1">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsConfirmingDelete(true);
                            }} 
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[10px] font-black uppercase tracking-tighter text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t.delete}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="px-3 py-1 space-y-3">
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded-xl">
                          <AlertCircle size={16} />
                          <span className="text-[9px] font-black uppercase leading-tight">{t.deleteConfirm}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setIsConfirmingDelete(false)}
                            className="flex-1 bg-slate-100 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-500"
                          >
                            {t.cancel}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(task.id);
                              closeMenu();
                            }}
                            className="flex-1 bg-red-500 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white shadow-sm shadow-red-200"
                          >
                            {t.save}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TaskCard;
