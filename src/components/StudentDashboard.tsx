import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, onSnapshot, orderBy, deleteDoc, getDoc } from 'firebase/firestore';
import { User, MockResult, StudyLog, Workbook, StudySubject } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion } from 'motion/react';
import { 
  BookOpen, Clock, Calendar, TrendingUp, Compass, Award, 
  Plus, CheckCircle, List, Send, BookMarked, User as UserIcon, Sparkles, Activity,
  Smile, Trophy, Medal, Bell, X, Trash2
} from 'lucide-react';

interface StudentDashboardProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
}

export default function StudentDashboard({ user, onUserUpdate }: StudentDashboardProps) {
  // DB States
  const [mockResults, setMockResults] = useState<MockResult[]>([]);
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([]);
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allLogsForRanking, setAllLogsForRanking] = useState<StudyLog[]>([]);
  
  // Input Forms
  const [targetSchool, setTargetSchool] = useState(user.target_school || '');
  const [targetDeviation, setTargetDeviation] = useState(user.target_deviation || 50);
  
  // Study Log Form
  const [studyDate, setStudyDate] = useState(new Date().toISOString().split('T')[0]);
  const [studyDuration, setStudyDuration] = useState<number>(30);
  const [studySubject, setStudySubject] = useState<StudySubject>('英語');
  const [studyContent, setStudyContent] = useState('');
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string>('');
  const [pagesFrom, setPagesFrom] = useState<number | ''>('');
  const [pagesTo, setPagesTo] = useState<number | ''>('');
  
  // UI States
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'recommendations' | 'active_workbooks'>('overview');
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingLog, setSavingLog] = useState(false);

  // Quick Study Timer and Quick Logger States
  const [quickTimerActive, setQuickTimerActive] = useState(false);
  const [quickTimerSeconds, setQuickTimerSeconds] = useState(0);
  const [quickSubject, setQuickSubject] = useState<StudySubject>('英語');
  const [quickDuration, setQuickDuration] = useState<number>(30);
  const [quickContent, setQuickContent] = useState('');
  const [quickWorkbookId, setQuickWorkbookId] = useState<string>('');
  const [quickPagesFrom, setQuickPagesFrom] = useState<number | ''>('');
  const [quickPagesTo, setQuickPagesTo] = useState<number | ''>('');
  const [savingQuickLog, setSavingQuickLog] = useState(false);
  const [isQuickPanelVisible, setIsQuickPanelVisible] = useState(false);

  // Notifications & Custom Workbook state
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const [notiState, setNotiState] = useState<Record<string, { commentCount: number, hasReaction: boolean }>>(() => {
    try {
      const stored = localStorage.getItem(`noti_state_${user.uid}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Custom workbook creation form
  const [isCustomWbOpen, setIsCustomWbOpen] = useState(false);
  const [newWbTitle, setNewWbTitle] = useState('');
  const [newWbSubject, setNewWbSubject] = useState<StudySubject>('英語');
  const [newWbTotalPages, setNewWbTotalPages] = useState<number | ''>('');
  const [savingCustomWb, setSavingCustomWb] = useState(false);

  // Delete Confirmation modal state
  const [confirmDeleteWb, setConfirmDeleteWb] = useState<{ id: string; title: string; isCustom: boolean } | null>(null);

  // Firestore Subscriptions
  useEffect(() => {
    if (!user.uid) return;

    // 1. Subscribe to student's mock results
    const mockRef = collection(db, 'mock_results');
    const qMock = query(mockRef, where('uid', '==', user.uid));
    const unsubscribeMock = onSnapshot(qMock, (snapshot) => {
      const results: MockResult[] = [];
      snapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as MockResult);
      });
      // Sort chronologically (using exam_date and sorting heuristically or simple sort)
      results.sort((a, b) => a.exam_date.localeCompare(b.exam_date));
      setMockResults(results);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'mock_results');
    });

    // 2. Subscribe to student's study logs
    const logsRef = collection(db, 'study_logs');
    const qLogs = query(logsRef, where('uid', '==', user.uid), orderBy('date', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const logs: StudyLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as StudyLog);
      });
      setStudyLogs(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'study_logs');
    });

    // 3. Live-sync all workbooks
    const workbooksRef = collection(db, 'workbooks');
    const unsubscribeWorkbooks = onSnapshot(workbooksRef, (snapshot) => {
      const books: Workbook[] = [];
      snapshot.forEach((docSnap) => {
        books.push({ id: docSnap.id, ...docSnap.data() } as Workbook);
      });
      setWorkbooks(books);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'workbooks');
    });

    // 4. Live-sync all students
    const usersRef = collection(db, 'users');
    const qStudents = query(usersRef, where('role', '==', 'student'));
    const unsubscribeAllStudents = onSnapshot(qStudents, (snapshot) => {
      const studs: User[] = [];
      snapshot.forEach((docSnap) => {
        studs.push({ uid: docSnap.id, ...docSnap.data() } as User);
      });
      setAllStudents(studs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    // 5. Live-sync all study logs (for global ranking)
    const allLogsRef = collection(db, 'study_logs');
    const unsubscribeAllLogs = onSnapshot(allLogsRef, (snapshot) => {
      const logs: StudyLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as StudyLog);
      });
      setAllLogsForRanking(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'study_logs');
    });

    return () => {
      unsubscribeMock();
      unsubscribeLogs();
      unsubscribeWorkbooks();
      unsubscribeAllStudents();
      unsubscribeAllLogs();
    };
  }, [user.uid]);

  // Quick Timer running logic
  useEffect(() => {
    let interval: any = null;
    if (quickTimerActive) {
      interval = setInterval(() => {
        setQuickTimerSeconds((prev) => {
          const next = prev + 1;
          const minutes = Math.floor(next / 60);
          if (minutes > 0) {
            setQuickDuration(minutes);
          }
          return next;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [quickTimerActive]);

  // Format seconds to timer representation '00:00:00'
  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Quick Log Saver
  const handleSaveQuickStudyLog = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingQuickLog(true);
    setFormSuccess(null);
    setFormError(null);

    // If timer is running, calculate actual minutes elapsed (minimum 1)
    const finalDuration = quickTimerActive 
      ? Math.max(1, Math.floor(quickTimerSeconds / 60)) 
      : quickDuration;

    if (finalDuration <= 0) {
      setFormError('学習時間は1分以上にしてください。');
      setSavingQuickLog(false);
      return;
    }

    if (quickWorkbookId) {
      if (quickPagesFrom !== '' && quickPagesTo !== '' && Number(quickPagesFrom) > Number(quickPagesTo)) {
        setFormError('開始ページ番号は終了ページ番号以下にしてください。');
        setSavingQuickLog(false);
        return;
      }
    }

    try {
      const targetWb = quickWorkbookId ? workbooks.find(w => w.id === quickWorkbookId) : null;
      const payload: StudyLog = {
        uid: user.uid,
        date: new Date().toISOString().split('T')[0],
        duration: Number(finalDuration),
        subject: quickSubject,
        content: quickContent.trim() || `${quickSubject}の学習記録（カンタン記録）`,
        ...(targetWb ? {
          workbookId: quickWorkbookId,
          workbookTitle: targetWb.title,
          ...(quickPagesFrom !== '' ? { pagesFrom: Number(quickPagesFrom) } : {}),
          ...(quickPagesTo !== '' ? { pagesTo: Number(quickPagesTo) } : {})
        } : {})
      };

      await addDoc(collection(db, 'study_logs'), payload);

      // Reset
      setQuickTimerActive(false);
      setQuickTimerSeconds(0);
      setQuickContent('');
      setQuickWorkbookId('');
      setQuickPagesFrom('');
      setQuickPagesTo('');
      setFormSuccess('⚡ カンタン学習記録を登録しました！継続できて素晴らしいです！');
      setTimeout(() => setFormSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setFormError('クイック登録中にエラーが発生しました。');
    } finally {
      setSavingQuickLog(false);
    }
  };

  // Synchronize subject when workbook selection shifts
  useEffect(() => {
    if (!selectedWorkbookId) return;
    const matchedWb = workbooks.find((w) => w.id === selectedWorkbookId);
    if (matchedWb && matchedWb.subject) {
      const sub = matchedWb.subject as StudySubject;
      if (['英語', '数学', '国語', '理科', '社会', 'その他'].includes(sub)) {
        setStudySubject(sub);
      } else {
        setStudySubject('その他');
      }
    }
  }, [selectedWorkbookId, workbooks]);

  // Synchronize quick subject when quick workbook selection shifts
  useEffect(() => {
    if (!quickWorkbookId) return;
    const matchedWb = workbooks.find((w) => w.id === quickWorkbookId);
    if (matchedWb && matchedWb.subject) {
      const sub = matchedWb.subject as StudySubject;
      if (['英語', '数学', '国語', '理科', '社会', 'その他'].includes(sub)) {
        setQuickSubject(sub);
      } else {
        setQuickSubject('その他');
      }
    }
  }, [quickWorkbookId, workbooks]);

  // Compute stats
  const totalStudyMinutes = studyLogs.reduce((sum, log) => sum + log.duration, 0);
  const totalStudyHours = (totalStudyMinutes / 60).toFixed(1);
  const recentResult = mockResults.length > 0 ? mockResults[mockResults.length - 1] : null;

  // Recommended workbooks filtering logic
  const latestDeviation = recentResult?.subject_deviations?.average || 50;
  const recommendedWorkbooks = workbooks.filter((book) => {
    // Exclude student's own self-registered/custom workbooks
    if (book.createdBy === user.uid) return false;
    // Exclude workbooks that are already registered
    if (book.id && (user.registered_workbooks || []).includes(book.id)) return false;
    // Show if student's latest deviation fits within the workbook range
    return latestDeviation >= book.min_deviation && latestDeviation <= book.max_deviation;
  });

  // Active / registered student workbooks list
  const activeStudentWorkbooks = workbooks.filter((book) => {
    return book.id && ((user.registered_workbooks || []).includes(book.id) || book.createdBy === user.uid);
  });

  // Total study time rankings computation for all students
  const studentRankings = allStudents
    .map((std) => {
      const stdLogs = allLogsForRanking.filter((log) => log.uid === std.uid);
      const cumulativeMinutes = stdLogs.reduce((sum, log) => sum + log.duration, 0);
      const cumulativeHours = Number((cumulativeMinutes / 60).toFixed(1));
      return {
        uid: std.uid,
        name: std.name,
        class: std.class,
        attendance_number: std.attendance_number,
        studyHours: cumulativeHours,
        logCount: stdLogs.length
      };
    })
    .sort((a, b) => b.studyHours - a.studyHours);

  // Target School Update
  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTarget(true);
    setFormSuccess(null);
    setFormError(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedData = {
        target_school: targetSchool,
        target_deviation: Number(targetDeviation)
      };
      await updateDoc(userRef, updatedData);
      
      onUserUpdate({
        ...user,
        ...updatedData
      });
      
      setFormSuccess('志望校と目標偏差値を設定しました！');
      setTimeout(() => setFormSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setFormError('設定の保存中にエラーが発生しました。');
    } finally {
      setSavingTarget(false);
    }
  };

  // Custom workbook creation handler
  const handleCreateCustomWorkbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWbTitle.trim()) return;
    setSavingCustomWb(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload: Workbook = {
        title: newWbTitle.trim(),
        subject: newWbSubject,
        min_deviation: 30,
        max_deviation: 85,
        totalPages: newWbTotalPages !== '' ? Number(newWbTotalPages) : undefined,
        createdBy: user.uid,
        instructions: '自主学習用登録教材'
      };
      
      const docRef = await addDoc(collection(db, 'workbooks'), payload);
      
      // Auto-register under student's profile inside 'users' collection
      const newList = [...(user.registered_workbooks || []), docRef.id];
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        registered_workbooks: newList
      });
      
      onUserUpdate({
        ...user,
        registered_workbooks: newList
      });
      
      setSelectedWorkbookId(docRef.id);
      setNewWbTitle('');
      setNewWbTotalPages('');
      setIsCustomWbOpen(false);
      
      setFormSuccess(`マイ問題集「${payload.title}」を自学教材として登録し、取り組み中に追加しました！`);
      setTimeout(() => setFormSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setFormError('教材の登録に失敗しました。');
    } finally {
      setSavingCustomWb(false);
    }
  };

  // Register a workbook to the student's active list
  const handleRegisterWorkbook = async (workbookId: string, title: string) => {
    try {
      setFormError(null);
      setFormSuccess(null);
      
      // Check if already registered
      const currentList = user.registered_workbooks || [];
      if (currentList.includes(workbookId)) {
        setFormSuccess(`「${title}」はすでに登録されています。`);
        return;
      }

      const newList = [...currentList, workbookId];
      
      // Update inside 'users' collection
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        registered_workbooks: newList
      });

      onUserUpdate({
        ...user,
        registered_workbooks: newList
      });

      setFormSuccess(`「${title}」を「取り組み中の問題集」に追加しました！学習記録で選択して進捗を記録できます。`);
      setTimeout(() => setFormSuccess(null), 3505);
    } catch (err: any) {
      console.error(err);
      setFormError('教材の登録に失敗しました。');
    }
  };

  // Remove registration or delete custom workbook
  const handleUnregisterWorkbook = async (workbookId: string, title: string) => {
    try {
      setFormError(null);
      setFormSuccess(null);

      // 1. Remove from student's registered workbooks list in profile
      const currentList = user.registered_workbooks || [];
      const newList = currentList.filter(id => id !== workbookId);

      // Update in Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        registered_workbooks: newList
      });

      // 2. If it is a student-created custom workbook, delete the workbook doc from 'workbooks'
      const wbDocRef = doc(db, 'workbooks', workbookId);
      const wbSnap = await getDoc(wbDocRef);
      if (wbSnap.exists()) {
        const data = wbSnap.data();
        if (data.createdBy === user.uid) {
          await deleteDoc(wbDocRef);
        }
      }

      onUserUpdate({
        ...user,
        registered_workbooks: newList
      });

      // Reset selection if deleted workbook was selected
      if (selectedWorkbookId === workbookId) {
        setSelectedWorkbookId('');
      }

      setFormSuccess(`「${title}」を、取り組み中の教材から解除・削除しました。`);
      setTimeout(() => setFormSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setFormError('教材の解除に失敗しました。');
    }
  };

  // Mark all comments and reactions as seen/read
  const handleClearNotifications = () => {
    const newState = { ...notiState };
    studyLogs.forEach(log => {
      if (log.id && ((log.comments && log.comments.length > 0) || log.reaction)) {
        newState[log.id] = {
          commentCount: log.comments ? log.comments.length : 0,
          hasReaction: !!log.reaction
        };
      }
    });
    setNotiState(newState);
    localStorage.setItem(`noti_state_${user.uid}`, JSON.stringify(newState));
  };

  // Computed unread logs list
  const unreadLogs = studyLogs.filter(log => {
    if (!log.id) return false;
    const commentCount = log.comments ? log.comments.length : 0;
    const hasReaction = !!log.reaction;
    if (commentCount === 0 && !hasReaction) return false;
    
    const state = notiState[log.id];
    if (!state) return true;
    if (commentCount > state.commentCount) return true;
    if (hasReaction && !state.hasReaction) return true;
    return false;
  });

  // Create Study Log
  const handleSaveStudyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLog(true);
    setFormSuccess(null);
    setFormError(null);

    if (studyDuration <= 0) {
      setFormError('学習時間は1分以上に設定してください。');
      setSavingLog(false);
      return;
    }

    if (selectedWorkbookId) {
      if (pagesFrom !== '' && pagesTo !== '' && Number(pagesFrom) > Number(pagesTo)) {
        setFormError('開始ページ番号は終了ページ番号以下にしてください。');
        setSavingLog(false);
        return;
      }
    }

    try {
      const targetWb = selectedWorkbookId ? workbooks.find(w => w.id === selectedWorkbookId) : null;
      const payload: StudyLog = {
        uid: user.uid,
        date: studyDate,
        duration: Number(studyDuration),
        subject: studySubject,
        content: studyContent.trim(),
        ...(targetWb ? {
          workbookId: selectedWorkbookId,
          workbookTitle: targetWb.title,
          ...(pagesFrom !== '' ? { pagesFrom: Number(pagesFrom) } : {}),
          ...(pagesTo !== '' ? { pagesTo: Number(pagesTo) } : {})
        } : {})
      };
      
      await addDoc(collection(db, 'study_logs'), payload);
      
      // Reset form content but keep subject & date for convenience
      setStudyContent('');
      setPagesFrom('');
      setPagesTo('');
      setSelectedWorkbookId('');
      setFormSuccess('新しい学習記録を追加しました！');
      setTimeout(() => setFormSuccess(null), 3500);
    } catch (err: any) {
      console.error(err);
      setFormError('学習記録の登録中にエラーが発生しました。');
    } finally {
      setSavingLog(false);
    }
  };

  // Recharts Data preparation
  const chartData = mockResults.map((res) => ({
    name: res.exam_name,
    '3科平均': res.subject_deviations.average || 0,
    '英語': res.subject_deviations.english || 0,
    '数学': res.subject_deviations.math || 0,
    '国語': res.subject_deviations.japanese || 0,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative" id="student-dashboard">
      {/* Real-time Notification Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-gray-100 shadow-sm gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center space-x-2">
            <span className="bg-indigo-600 w-1.5 h-5 rounded-full inline-block"></span>
            <span>生徒指導・学習管理ポータル</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            日々の自主勉強時間を学習記録として残し、担当の先生から指導や反応をもらってレベルアップしましょう。
          </p>
        </div>

        {/* Bell Icon for Notifications */}
        <div className="relative self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setIsNotiOpen(!isNotiOpen)}
            className="p-3 rounded-xl border border-gray-150 hover:bg-gray-55 text-gray-500 hover:text-indigo-600 transition-all relative shrink-0 flex items-center justify-center bg-white shadow-sm"
            title="新着コメント・リアクション通知"
          >
            <Bell className="h-5 w-5" />
            {unreadLogs.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                {unreadLogs.length}
              </span>
            )}
          </button>

          {/* New Comments & Reactions Notification Dropdown Box */}
          {isNotiOpen && (
            <div className="absolute right-0 mt-3 w-85 sm:w-96 max-w-[calc(100vw-2.5rem)] bg-white rounded-2xl border border-gray-150 shadow-2xl overflow-hidden z-30">
              <div className="flex justify-between items-center px-4 py-3 bg-indigo-50/70 border-b border-indigo-100/50">
                <span className="text-xs font-bold text-indigo-900 flex items-center space-x-1.5">
                  <Bell className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span>先生からの指導・リアクション ({unreadLogs.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleClearNotifications();
                    setIsNotiOpen(false);
                  }}
                  className="text-[10px] font-black text-indigo-700 hover:text-indigo-950 transition-colors bg-white hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200"
                >
                  すべて既読にする
                </button>
              </div>

              <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
                {unreadLogs.length === 0 ? (
                  <div className="py-10 text-center text-xs text-gray-400 flex flex-col items-center justify-center px-6">
                    <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                    <p className="font-semibold text-gray-650">新着の通知はありません</p>
                    <p className="text-[10px] text-gray-400 mt-1">先生が学習記録に対してスタンプ（リアクション）や指導コメントを入力すると、ここにリアルタイムで表示されます。</p>
                  </div>
                ) : (
                  unreadLogs.map(log => {
                    const latestComment = log.comments && log.comments.length > 0
                      ? log.comments[log.comments.length - 1]
                      : null;
                    return (
                      <div key={log.id} className="p-3.5 hover:bg-gray-50/50 transition-all text-left space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-indigo-750 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {log.subject}の学習
                          </span>
                          <span className="text-[10px] font-mono text-gray-400">{log.date}</span>
                        </div>

                        {log.reaction && (
                          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-100/50 px-2 py-1 rounded-lg w-fit text-xs text-amber-900 font-bold">
                            <Smile className="h-3.5 w-3.5 text-amber-500 mr-0.5" />
                            <span>スタンプ：</span>
                            <span className="text-base font-black animate-pulse">{log.reaction}</span>
                          </div>
                        )}

                        {latestComment && (
                          <div className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-100 space-y-1">
                            <span className="font-bold text-[10px] block text-indigo-700">
                              💬 {latestComment.teacherName} 先生より
                            </span>
                            <p className="leading-relaxed font-medium text-gray-850 p-1 bg-white rounded border border-gray-50">{latestComment.comment}</p>
                          </div>
                        )}
                        
                        <div className="text-[9px] text-gray-400 italic">
                          学習記録内容: {log.content ? (log.content.length > 30 ? `${log.content.slice(0, 30)}...` : log.content) : '詳細記載なし'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ⚡ Mobile Friendly Floating Quick Study Timer Panel */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 p-5 rounded-2xl text-white shadow-xl border border-indigo-750 relative overflow-hidden" id="quick-recording-panel">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl -z-10"></div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-indigo-800 pb-3.5 mb-4 gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h2 className="text-base font-black tracking-wider text-emerald-300">⚡ カンタン1タップ学習記録 & タイマー</h2>
            </div>
            <p className="text-xs text-indigo-200 mt-0.5">
              スマホに最適化！学習時間をタイマーで計るか、+15分などのボタンをタップしてすぐにがんばりを登録できます。
            </p>
          </div>
          <button 
            type="button"
            onClick={() => setIsQuickPanelVisible(!isQuickPanelVisible)}
            className="text-[11px] font-bold text-indigo-200 bg-indigo-800/60 hover:bg-indigo-800 py-1.5 px-3 rounded-lg border border-indigo-700/50 transition-all self-end sm:self-auto shrink-0"
          >
            {isQuickPanelVisible ? 'パネルをたたむ' : '記録パネルを開く'}
          </button>
        </div>

        {isQuickPanelVisible && (
          <form onSubmit={handleSaveQuickStudyLog} className="space-y-4 animate-fadeIn">
            {/* Form Inner Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              {/* Left Column: Subject Selection Large Buttons */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-indigo-200 uppercase tracking-widest">1．学習教科を選択 (1タップで切り替え)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: '英語', label: '英語', emoji: '🇬🇧', bg: 'bg-emerald-600/25 border-emerald-500/20 hover:bg-emerald-600/40 text-emerald-250' },
                    { value: '数学', label: '数学', emoji: '📐', bg: 'bg-blue-600/25 border-blue-500/20 hover:bg-blue-600/40 text-blue-250' },
                    { value: '国語', label: '国語', emoji: '📖', bg: 'bg-red-600/25 border-red-500/20 hover:bg-red-600/40 text-red-250' },
                    { value: '理科', label: '理科', emoji: '🧪', bg: 'bg-indigo-600/25 border-indigo-500/20 hover:bg-indigo-600/40 text-indigo-250' },
                    { value: '社会', label: '社会', emoji: '🗺️', bg: 'bg-amber-600/25 border-amber-500/20 hover:bg-amber-600/40 text-amber-250' },
                    { value: 'その他', label: 'その他', emoji: '✏️', bg: 'bg-slate-600/25 border-slate-500/20 hover:bg-slate-600/40 text-slate-250' },
                  ].map((sub) => {
                    const isSelected = quickSubject === sub.value;
                    return (
                      <button
                        key={sub.value}
                        type="button"
                        onClick={() => setQuickSubject(sub.value as StudySubject)}
                        className={`py-3 px-1.5 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all ${
                          isSelected 
                            ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20 scale-[1.03] ring-2 ring-indigo-400' 
                            : `${sub.bg} border-indigo-900/30`
                        }`}
                      >
                        <span className="text-xl">{sub.emoji}</span>
                        <span className="text-xs font-black">{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Time setup and timer */}
              <div className="space-y-4">
                <label className="block text-xs font-bold text-indigo-200 uppercase tracking-widest">2．学習時間を設定（またはリアルタイム計測）</label>
                
                {/* Timer Box */}
                <div className="bg-indigo-950/60 p-4 rounded-2xl border border-indigo-800/80 flex flex-col items-center justify-center text-center space-y-3">
                  {/* Digital Clock Display */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-indigo-300">STUDY RUNNING TIMER</span>
                    <div className="font-mono text-3xl sm:text-4xl font-black text-emerald-400 tracking-wider">
                      {formatTime(quickTimerSeconds)}
                    </div>
                    {quickTimerActive && (
                      <span className="text-[10px] text-emerald-300 font-semibold animate-pulse block">
                        タイマー計測中... ({Math.max(1, Math.floor(quickTimerSeconds / 60))} 分として保存されます)
                      </span>
                    )}
                  </div>

                  {/* Stopwatch controls */}
                  <div className="flex space-x-2 w-full">
                    {!quickTimerActive ? (
                      <button
                        type="button"
                        onClick={() => setQuickTimerActive(true)}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-450 hover:to-teal-450 text-slate-900 font-extrabold py-2 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <Clock className="h-4 w-4 shrink-0" />
                        <span>勉強を開始（タイマーON）</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuickTimerActive(false)}
                        className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-450 hover:to-amber-550 text-slate-950 font-extrabold py-2 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <Clock className="h-4 w-4 shrink-0" />
                        <span>一時停止</span>
                      </button>
                    )}
                    {quickTimerSeconds > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickTimerActive(false);
                          setQuickTimerSeconds(0);
                        }}
                        className="bg-slate-800/80 hover:bg-slate-700 text-gray-200 font-bold px-3 py-2 rounded-xl text-xs"
                      >
                        リセット
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Add Buttons Section */}
                <div className="space-y-2">
                  <span className="text-[10px] text-indigo-250 block font-bold">⏱️ 1タップで時間を増減 (タイマー停止時も使えます)</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '＋15分', value: 15 },
                      { label: '＋30分', value: 30 },
                      { label: '＋60分', value: 60 },
                      { label: '＋90分', value: 90 },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => {
                          // If timer has been running, let's convert total elapsed seconds to equivalent manual mins
                          if (quickTimerSeconds > 0) {
                            const newSeconds = quickTimerSeconds + (btn.value * 60);
                            setQuickTimerSeconds(newSeconds);
                            setQuickDuration(Math.floor(newSeconds / 60));
                          } else {
                            setQuickDuration((prev) => prev + btn.value);
                          }
                        }}
                        className="flex-1 bg-indigo-900/50 hover:bg-indigo-850 px-2.5 py-1.5 rounded-lg border border-indigo-850 text-xs text-indigo-250 font-extrabold transition-all hover:scale-[1.02]"
                      >
                        {btn.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickTimerSeconds(0);
                        setQuickDuration(0);
                      }}
                      className="bg-red-950/40 hover:bg-red-900/40 text-red-300 font-extrabold px-3 py-1.5 rounded-lg border border-red-900/20 text-xs shrink-0"
                    >
                      クリア
                    </button>
                  </div>
                  
                  {/* Manual Duration feedback */}
                  <div className="flex items-center justify-between bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-900/20 text-xs">
                    <span className="text-indigo-200">登録される学習時間:</span>
                    <div className="flex items-center space-x-1.5">
                      <input 
                        type="number"
                        min="1"
                        value={quickDuration}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 0);
                          setQuickDuration(val);
                          if (!quickTimerActive) {
                            setQuickTimerSeconds(val * 60);
                          }
                        }}
                        className="w-16 text-center py-0.5 px-1 bg-indigo-950 border border-indigo-700 rounded text-emerald-300 font-mono font-bold text-sm"
                      />
                      <span className="font-bold text-indigo-150">分間</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Optional Workbook and Memo description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-indigo-900/50 pt-4">
              <div>
                <label className="block text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">📖 関連問題集を指定（任意）</label>
                <select
                  value={quickWorkbookId}
                  onChange={(e) => setQuickWorkbookId(e.target.value)}
                  className="block w-full px-3 py-2 bg-indigo-950 border border-indigo-800 rounded-lg text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- 指定なし（その他の学習） --</option>
                  {activeStudentWorkbooks.map((book) => (
                    <option key={book.id} value={book.id}>{book.title} ({book.subject})</option>
                  ))}
                </select>
              </div>

              {/* Progress Page Range (Appears when workbook is selected) */}
              {quickWorkbookId && (
                <div className="animate-fadeIn">
                  <label className="block text-[10px] font-bold text-emerald-300 uppercase tracking-wider mb-1">📖 進捗ページ範囲（任意）</label>
                  <div className="flex items-center space-x-1.5 bg-indigo-950 border border-indigo-800 rounded-lg px-2 py-1.5 text-xs">
                    <input
                      type="number"
                      min="1"
                      placeholder="開始"
                      value={quickPagesFrom}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setQuickPagesFrom('');
                        } else {
                          const parsed = parseInt(val, 10);
                          setQuickPagesFrom(isNaN(parsed) ? '' : Math.max(1, parsed));
                        }
                      }}
                      className="w-14 text-center bg-indigo-900/40 border-b border-indigo-700 text-white placeholder-indigo-500 font-mono font-bold focus:outline-none focus:border-indigo-400 py-0.5 rounded"
                    />
                    <span className="text-indigo-300 shrink-0 text-[10px]">p 〜</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="終了"
                      value={quickPagesTo}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          setQuickPagesTo('');
                        } else {
                          const parsed = parseInt(val, 10);
                          setQuickPagesTo(isNaN(parsed) ? '' : Math.max(1, parsed));
                        }
                      }}
                      className="w-14 text-center bg-indigo-900/40 border-b border-indigo-700 text-white placeholder-indigo-500 font-mono font-bold focus:outline-none focus:border-indigo-400 py-0.5 rounded"
                    />
                    <span className="text-indigo-300 shrink-0 text-[10px]">p</span>
                  </div>
                </div>
              )}

              <div className={quickWorkbookId ? "col-span-1" : "col-span-1 sm:col-span-1"}>
                <label className="block text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">📝 取り組んだ内容のメモ（任意）</label>
                <input
                  type="text"
                  placeholder="例：英単語100語暗記、テキストのp10〜12"
                  value={quickContent}
                  onChange={(e) => setQuickContent(e.target.value)}
                  className="block w-full px-3 py-1.5 bg-indigo-950 border border-indigo-800 rounded-lg text-xs text-white placeholder-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingQuickLog}
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-450 hover:to-purple-550 text-white font-extrabold py-3 px-8 rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 shrink-0 cursor-pointer"
              >
                <Send className="h-4 w-4 shrink-0" />
                {savingQuickLog ? <span>登録中...</span> : <span>学習のがんばりを登録する！</span>}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Target Setting & Overview Headline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Profile Card & Target Setter */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                <UserIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg leading-tight">{user.name}</h3>
                <p className="text-xs text-gray-500 font-mono tracking-wide">{user.grade} · {user.class}組 {parseInt(user.attendance_number || '0')}番</p>
              </div>
            </div>
            
            <form onSubmit={handleSaveTarget} className="space-y-4 pt-2 border-t border-gray-50">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">第一志望校 目標設定</h4>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">志望大学・学校名</label>
                <input
                  type="text"
                  placeholder="国公立・私立大学など"
                  value={targetSchool}
                  onChange={(e) => setTargetSchool(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">目標偏差値 ({targetDeviation})</label>
                <input
                  type="range"
                  min="35"
                  max="80"
                  step="1"
                  value={targetDeviation}
                  onChange={(e) => setTargetDeviation(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-mono px-1">
                  <span>35</span>
                  <span>50</span>
                  <span>65</span>
                  <span>80</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingTarget}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2 px-4 rounded-lg text-xs transition duration-200 flex justify-center items-center space-x-2"
              >
                {savingTarget ? <span>設定中...</span> : <span>目標設定を更新</span>}
              </button>
            </form>
          </div>
        </div>

        {/* Dynamic Widget Grid - Refactored to pack gaps and add meaningful analysis features */}
        <div className="lg:col-span-2 flex flex-col justify-between gap-6">
          {/* Top Row: Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Card: Study Hours */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">累積学習 & 順位</span>
              </div>
              <div className="pt-3">
                <div className="flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-gray-900 tracking-tight">{totalStudyHours}</span>
                  <span className="text-xs font-semibold text-gray-400">時間</span>
                </div>
                
                <div className="mt-2 inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/50 w-full">
                  <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">
                    学内順位: <strong className="font-extrabold text-sm text-amber-800">
                      {studentRankings.findIndex((item) => item.uid === user.uid) + 1 || '—'}
                    </strong> 位 <span className="text-[10px] text-gray-400 font-normal">/ {studentRankings.length}人中</span>
                  </span>
                </div>

                <div className="text-[10px] text-gray-450 mt-2 flex items-center space-x-1">
                  <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>自主学習の記録 {studyLogs.length}件</span>
                </div>
              </div>
            </div>

            {/* Card: Latest Deviation */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">直近成績</span>
              </div>
              <div className="pt-3">
                <div className="flex items-baseline space-x-1">
                  <span className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    {recentResult ? (recentResult.subject_deviations.average || '—') : '—'}
                  </span>
                  {recentResult && <span className="text-xs text-gray-400 font-medium">平均偏差値</span>}
                </div>
                {recentResult && (
                  <span className="text-[10px] font-semibold text-indigo-650 bg-indigo-50 border border-indigo-100/50 px-2 py-1 rounded-lg block mt-2 truncate text-center" title={recentResult.exam_name}>
                    {recentResult.exam_name}
                  </span>
                )}
                {!recentResult && (
                  <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                    模試成績がまだ未登録です。先生のCSV等で登録されます。
                  </p>
                )}
              </div>
            </div>

            {/* Card: Target School */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="bg-amber-50 text-amber-600 p-2 rounded-xl">
                  <Award className="h-5 w-5" />
                </div>
                <span className="text-[10px] uppercase font-mono tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold">志望目標</span>
              </div>
              <div className="pt-3">
                <h4 className="text-lg font-bold text-gray-900 truncate" title={user.target_school || '学校名未設定'}>
                  {user.target_school || '大学名未設定'}
                </h4>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-500">目標偏差値</span>
                  <span className="font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-100">{user.target_deviation || '—'}</span>
                </div>
                {!user.target_school && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    左カラムの目標設定から第一志望を設定しましょう
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row: Dynamic Target Gap Analyzer & Strategy Card (Fills the heavy empty space) */}
          <div className="bg-gradient-to-r from-indigo-50/50 via-white to-amber-50/40 p-5 rounded-2xl border border-indigo-150/40 flex flex-col md:flex-row items-stretch gap-4 shadow-xs text-left">
            {/* Dynamic Result vs. Target Analyzer */}
            <div className="flex-1 bg-white p-4 rounded-xl border border-indigo-100/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-1.5 pb-2 border-b border-gray-100">
                  <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                  <span className="text-[10px] font-black text-indigo-700 tracking-wider">🎯 志望校 ギャップ分析</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-medium font-sans">現在の実績 (3科平均)</span>
                    <span className="font-bold text-gray-800">{latestDeviation ? latestDeviation.toFixed(1) : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-medium font-sans">第一志望目標偏差値</span>
                    <span className="font-bold text-amber-600">{user.target_deviation || '—'}</span>
                  </div>
                  <div className="border-t border-dashed border-gray-100 my-1" />
                  <div className="flex justify-between items-center text-xs pt-1">
                    <span className="font-bold text-gray-700 font-sans">合格までの差分</span>
                    {user.target_deviation && latestDeviation ? (
                      (() => {
                        const diff = user.target_deviation - latestDeviation;
                        if (diff <= 0) {
                          return <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">突破！(A判定相当)</span>;
                        } else if (diff < 3) {
                          return <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">あと ＋{diff.toFixed(1)} (B判定)</span>;
                        } else if (diff < 6) {
                          return <span className="text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">あと ＋{diff.toFixed(1)} (C判定)</span>;
                        } else {
                          return <span className="text-[11px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">あと ＋{diff.toFixed(1)} (D判定)</span>;
                        }
                      })()
                    ) : (
                      <span className="text-[10px] text-gray-400">志望校未設定</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Micro Coaching Board */}
            <div className="flex-[1.5] bg-white p-4 rounded-xl border border-indigo-100/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-1.5 pb-2 border-b border-gray-100">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-amber-700 tracking-wider">💡 ロードマップ・戦略指導</span>
                </div>
                <p className="text-[11px] text-gray-650 leading-relaxed font-semibold font-sans mt-3">
                  {(() => {
                    if (!user.target_school || !user.target_deviation) {
                      return 'まずは左の志望目標カードで志望校名と目標偏差値を設定しましょう！設定すると、現在の最新偏差値に紐づいた教科別のパーソナルアドバイスがここに毎日自動表示されます。';
                    }
                    if (!latestDeviation || latestDeviation === 0) {
                      return '模試データが未登録です。日常学習の習慣づくりを最優先にしましょう！英語や数学など得意な教科から「問題集」を始め、学習記録を着実に残していくのが秘訣です。';
                    }
                    const diff = user.target_deviation - latestDeviation;
                    if (diff <= 0) {
                      return `おめでとうございます。素晴らしい実力です！${user.target_school}の目標値を超えています。このアドバンテージを崩さないよう、配付中問題集の「発展」「過去問」などを解き進め、難問対応力を究めましょう。`;
                    }
                    if (diff <= 3.5) {
                      return `目標の${user.target_school}まであとわずか「${diff.toFixed(1)}」の距離です！「おすすめ問題集」にある適切な偏差値帯(50~65)の教材に毎日30分以上取り組み、弱点分野の解法暗記を網羅して安全圏へ滑り込みましょう。`;
                    }
                    return `目標の${user.target_school}と現在の実力とのギャップは「＋${diff.toFixed(1)}」です。現時点では焦らず「おすすめ問題集」から偏差値帯にマッチした教材にチェックを入れて取り組みを開始し、教科書の章末問題や基礎公式の徹底から段階を追って伸ばしましょう。`;
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {formSuccess && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded text-sm text-emerald-700 font-semibold" id="operation-success">
          {formSuccess}
        </div>
      )}

      {formError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700 font-semibold shadow-sm" id="operation-error">
          {formError}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6 overflow-x-auto scrollbar-none whitespace-nowrap pb-px px-1" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>総合データ推移</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <List className="h-4 w-4" />
            <span>日常学習の記録</span>
          </button>
          <button
            onClick={() => setActiveTab('recommendations')}
            className={`py-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'recommendations'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>おすすめ問題集</span>
            {recommendedWorkbooks.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-600 text-white leading-none font-bold">
                {recommendedWorkbooks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('active_workbooks')}
            className={`py-4 px-1 border-b-2 font-bold text-sm transition-all flex items-center space-x-2 shrink-0 ${
              activeTab === 'active_workbooks'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <BookMarked className="h-4 w-4" />
            <span>取り組み中の問題集</span>
            {activeStudentWorkbooks.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-600 text-white leading-none font-bold">
                {activeStudentWorkbooks.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart Card (Takes 2 columns) */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">模試偏差値の推移</h3>
                  <p className="text-xs text-gray-500">これまでの模試における偏差値の遷移を比較できます。</p>
                </div>
                {user.target_deviation && (
                  <div className="mt-2 sm:mt-0 inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>目標偏差値: {user.target_deviation}</span>
                  </div>
                )}
              </div>

              <div className="h-80 w-full" id="deviation-chart-wrapper">
                {mockResults.length === 0 ? (
                  <div className="h-full w-full flex flex-col justify-center items-center bg-gray-50 rounded-xl p-8 border border-dashed border-gray-200">
                    <TrendingUp className="h-10 w-10 text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-500">模試結果がありません</p>
                    <p className="text-xs text-gray-400 text-center mt-1">先生が模試成績CSVをインポートするか、<br/>データが追加されるとここに推移グラフが描画されます。</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="105%">
                    <LineChart data={chartData} margin={{ top: 15, right: 15, left: -25, bottom: 15 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#9CA3AF" 
                        fontSize={9} 
                        tickLine={false} 
                        height={40}
                        tickFormatter={(val) => val ? (val.length > 9 ? `${val.substring(0, 9)}...` : val) : ''}
                      />
                      <YAxis domain={[30, 85]} stroke="#9CA3AF" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }} />
                      {user.target_deviation && (
                        <ReferenceLine
                          y={user.target_deviation}
                          stroke="#F59E0B"
                          strokeDasharray="4 4"
                          label={{ value: '志望校目標', fill: '#D97706', fontSize: 10, position: 'insideTopLeft', offset: 10 }}
                        />
                      )}
                      <Line name="3科平均" type="monotone" dataKey="3科平均" stroke="#4F46E5" strokeWidth={3} activeDot={{ r: 6 }} />
                      <Line name="英語" type="monotone" dataKey="英語" stroke="#10B981" strokeWidth={1.5} strokeDasharray="3 3" />
                      <Line name="数学" type="monotone" dataKey="数学" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="3 3" />
                      <Line name="国語" type="monotone" dataKey="国語" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-indigo-50 p-4 rounded-xl mt-6">
              <span className="text-xs font-bold text-indigo-700 block mb-1">💡 フィードバックアドバイス</span>
              <p className="text-xs text-indigo-600 leading-relaxed">
                {latestDeviation >= 65 
                  ? '素晴らしい学力水準です！難関国公立レベルのWorkbookを完了し、時間配分の戦術強化に焦点を当てましょう。' 
                  : latestDeviation >= 50
                    ? '標準レベルの基礎は完成しています。得意教科の強みを伸ばしながら、他教科のウィークポイントを問題集で丁寧に対策してください。'
                    : 'まずは教科書レベルの重要事項・公式の定着を図りましょう。英語単語・古典単語の毎日の継続的な暗記が近道です。'}
              </p>
            </div>
          </div>

          {/* Right Panel: Side Stats (Workbooks + Rankings) */}
          <div className="space-y-6 flex flex-col">
            {/* Widget 1: Registered Workbooks Progress & Page Achievement */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex-1">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  <span>登録問題集の進捗・到達度</span>
                </h3>
                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">到達率（％）</span>
              </div>
              
              {(() => {
                const registeredAndLoggedWbs = workbooks.filter(book => {
                  const isCustom = book.id && book.createdBy === user.uid;
                  const isRegistered = book.id && (user.registered_workbooks || []).includes(book.id);
                  const hasLogs = studyLogs.some(log => log.workbookId === book.id);
                  return isCustom || isRegistered || hasLogs;
                });

                if (registeredAndLoggedWbs.length === 0) {
                  return (
                    <div className="flex flex-col justify-center items-center py-12 text-gray-400 text-center text-xs space-y-2">
                      <Compass className="h-8 w-8 text-gray-300 animate-pulse" />
                      <span>
                        自分で「問題集を登録」するか、<br />
                        学習記録で問題集を選択すると、<br />
                        ここの進捗欄に％評価が表示されます。
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                    {registeredAndLoggedWbs.map((book) => {
                      const bookLogs = studyLogs.filter((log) => log.workbookId === book.id);
                      const totalMinutes = bookLogs.reduce((sum, log) => sum + log.duration, 0);
                      const totalHours = (totalMinutes / 60).toFixed(1);
                      
                      const maxPageCompleted = bookLogs.length > 0 
                        ? Math.max(...bookLogs.map((l) => l.pagesTo || 0), 0) 
                        : 0;
                        
                      const totalPages = book.totalPages || 0;
                      const progressPercentage = totalPages > 0 
                        ? Math.min(100, Math.round((maxPageCompleted / totalPages) * 100)) 
                        : 0;

                      const progressColors: Record<string, string> = {
                        英語: 'bg-emerald-500',
                        数学: 'bg-blue-500',
                        国語: 'bg-red-500',
                        理科: 'bg-teal-500',
                        社会: 'bg-amber-500',
                        その他: 'bg-purple-500'
                      };
                      
                      const colorClass = progressColors[book.subject] || 'bg-indigo-550';

                      return (
                        <div key={book.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-150 hover:bg-gray-100/50 transition-all">
                          <div className="flex justify-between items-start mb-1 gap-1">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1.5 mb-1 flex-wrap">
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-150 text-indigo-800 shrink-0">
                                  {book.subject}
                                </span>
                                {book.createdBy === user.uid && (
                                  <span className="text-[9px] font-bold px-1 rounded bg-amber-150 text-amber-800 shrink-0">
                                    マイ教材
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-gray-800 truncate" title={book.title}>
                                {book.title}
                              </h4>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-black text-indigo-700">{progressPercentage}%</span>
                            </div>
                          </div>

                          {/* Progress Bar slider design */}
                          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden my-2">
                            <div 
                              className={`${colorClass} h-full transition-all duration-500`} 
                              style={{ width: `${totalPages > 0 ? progressPercentage : (maxPageCompleted > 0 ? 100 : 0)}%` }} 
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-0.5 text-gray-400" />
                              累計時間: <strong className="text-gray-700 font-bold ml-0.5">{totalHours}</strong>h
                            </span>
                            {totalPages > 0 ? (
                              <span>
                                進捗: <strong className="text-indigo-600 font-bold">{maxPageCompleted}</strong> / {totalPages}p
                              </span>
                            ) : (
                              <span>
                                到達: <strong className="text-gray-750 font-bold">{maxPageCompleted}</strong>p <span className="text-[9px] font-sans text-gray-400 font-normal">(総数未設定)</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Study Form */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="study-log-form-wrapper">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-2 mb-4">今日のがんばりを記録</h3>
            
            <form onSubmit={handleSaveStudyLog} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">学習実施日</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    required
                    value={studyDate}
                    onChange={(e) => setStudyDate(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">学習教科</label>
                  <select
                    value={studySubject}
                    onChange={(e) => setStudySubject(e.target.value as StudySubject)}
                    className="block w-full px-2 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="英語">英語</option>
                    <option value="数学">数学</option>
                    <option value="国語">国語</option>
                    <option value="理科">理科</option>
                    <option value="社会">社会</option>
                    <option value="その他">その他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">学習時間（分）</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={studyDuration}
                    onChange={(e) => setStudyDuration(parseInt(e.target.value) || 0)}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Recommended or Custom Workbook progress (Optional) */}
              <div className="space-y-3 p-3 bg-indigo-50/40 rounded-xl border border-indigo-100/30">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-indigo-700">取組中の問題集 (任意)</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomWbOpen(true)}
                      className="text-[10px] font-bold text-indigo-650 hover:text-indigo-800 flex items-center space-x-1 border border-indigo-200/40 bg-white px-2 py-0.5 rounded-md shadow-xs"
                    >
                      <Plus className="h-2.5 w-2.5 text-indigo-505 shrink-0" />
                      <span>自分で追加</span>
                    </button>
                  </div>
                  <select
                    value={selectedWorkbookId}
                    onChange={(e) => {
                      setSelectedWorkbookId(e.target.value);
                      const selectedWb = workbooks.find(w => w.id === e.target.value);
                      if (selectedWb) {
                        setStudySubject(selectedWb.subject as StudySubject);
                      }
                    }}
                    className="block w-full px-2.5 py-2 border border-indigo-100/60 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans font-medium"
                  >
                    <option value="">-- 指定なし (通常・その他学習) --</option>
                    {activeStudentWorkbooks.map((book) => (
                      <option key={book.id} value={book.id}>
                        [{book.subject}] {book.title} {book.createdBy === user.uid ? ' (★マイ登録)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedWorkbookId && (
                  <div className="grid grid-cols-2 gap-3 pt-0.5">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-600 mb-0.5">開始ページ</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="例: 14"
                        value={pagesFrom}
                        onChange={(e) => setPagesFrom(e.target.value === '' ? '' : Number(e.target.value))}
                        className="block w-full px-2.5 py-1.5 border border-indigo-200 bg-white rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-600 mb-0.5">終了ページ</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="例: 18"
                        value={pagesTo}
                        onChange={(e) => setPagesTo(e.target.value === '' ? '' : Number(e.target.value))}
                        className="block w-full px-2.5 py-1.5 border border-indigo-200 bg-white rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">学習内容</label>
                <textarea
                  placeholder="例：英語の長文読解、センター数学大問2解答など"
                  value={studyContent}
                  onChange={(e) => setStudyContent(e.target.value)}
                  rows={4}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingLog}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition shadow-sm"
              >
                {savingLog ? <span>記録中...</span> : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>学習記録を保存</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* History List */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-2 mb-4">学習の履歴</h3>
              
              {studyLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <BookOpen className="h-10 w-10 mx-auto text-gray-200 mb-2" />
                  <p className="text-sm">学習記録がまだありません。</p>
                  <p className="text-xs mt-1">毎日コツコツ記録して日々の頑張りを見える化しましょう！</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2" id="study-logs-container">
                  {studyLogs.map((log) => {
                    const subjectColors: Record<StudySubject, string> = {
                      英語: 'text-emerald-700 bg-emerald-50 border-emerald-100',
                      数学: 'text-blue-700 bg-blue-50 border-blue-100',
                      国語: 'text-red-700 bg-red-50 border-red-100',
                      理科: 'text-teal-700 bg-teal-50 border-teal-100',
                      社会: 'text-amber-700 bg-amber-50 border-amber-100',
                      その他: 'text-purple-700 bg-purple-50 border-purple-100'
                    };

                    return (
                      <div key={log.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-sm transition-all flex flex-col justify-between gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${subjectColors[log.subject]}`}>
                                {log.subject}
                              </span>
                              <span className="text-[11px] text-gray-400 font-mono flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {log.date}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-gray-800 leading-relaxed mt-1">{log.content || '詳細なし'}</p>
                          </div>
                          
                          <div className="flex items-center space-x-1 font-mono text-gray-900 font-bold shrink-0 self-end sm:self-start bg-gray-100/60 px-2 py-0.5 rounded-md">
                            <Clock className="h-3.5 w-3.5 text-indigo-500" />
                            <span className="text-xs">{log.duration}</span>
                            <span className="text-[10px] text-gray-400 font-normal">分</span>
                          </div>
                        </div>

                        {/* Workbook & Progress Pages Badge */}
                        {log.workbookTitle && (
                          <div className="inline-flex items-center space-x-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100/60 w-fit px-2 py-1 rounded-lg">
                            <BookOpen className="h-3 w-3" />
                            <span className="font-bold">{log.workbookTitle}</span>
                            {log.pagesFrom !== undefined && log.pagesTo !== undefined && (
                              <span className="font-mono text-indigo-800 ml-1 bg-indigo-100/50 px-1 rounded">
                                {log.pagesFrom}p 〜 {log.pagesTo}p
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reaction and comments wrapper */}
                        {((log.comments && log.comments.length > 0) || log.reaction) && (
                          <div className="pt-2 border-t border-gray-200/50 space-y-2">
                            {/* Emoji Reaction */}
                            {log.reaction && (
                              <div className="flex items-center space-x-1 bg-amber-50 rounded-lg px-2 py-1 w-fit border border-amber-100/40 select-none">
                                <span className="text-[10px] text-amber-800 font-bold flex items-center">
                                  <Smile className="h-3.5 w-3.5 mr-1 text-amber-500" />
                                  提出済スタンプ:
                                </span>
                                <span className="text-sm font-bold animate-pulse">{log.reaction}</span>
                              </div>
                            )}

                            {/* Teacher comments bubbles */}
                            {log.comments && log.comments.length > 0 && (
                              <div className="space-y-1.5 pl-2 border-l-2 border-indigo-200">
                                <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider block">💬 教員コメント:</span>
                                {log.comments.map((comment: any) => (
                                  <div key={comment.id} className="text-[11px] leading-normal font-medium bg-indigo-50/20 p-2 rounded-xl text-gray-800 border border-indigo-100/10">
                                    <p className="font-semibold text-gray-700">{comment.comment}</p>
                                    <span className="text-[9px] text-gray-400 font-mono mt-0.5 block">
                                      {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'recommendations' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="recommendations-container">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">あなたに適したレベルのおすすめ問題集</h3>
              <p className="text-xs text-gray-500">直近の模試成績偏差値（現在の実力：{latestDeviation}）に適した、教員が登録したおすすめ問題集が表示されます。</p>
            </div>
            <div className="mt-2 sm:mt-0 font-semibold px-3 py-1.5 rounded-xl text-xs bg-indigo-50 text-indigo-700 flex items-center space-x-1.5">
              <Sparkles className="h-4 w-4" />
              <span>偏差値別 自動マッチング</span>
            </div>
          </div>

          {/* おすすめ問題集の使い方（説明）説明カード */}
          <div className="mb-6 p-4 bg-indigo-55/35 rounded-2xl border border-indigo-100/50 text-left text-xs leading-relaxed space-y-2">
            <h4 className="font-black text-indigo-900 flex items-center text-sm">
              <Compass className="h-4 w-4 mr-1.5 text-indigo-600 shrink-0" />
              【使い方・ご案内】あなたに最適なおすすめ問題集とは？
            </h4>
            <p className="text-gray-655 font-semibold text-[11px]">
              この機能は、あなたの直近の模試の <strong className="text-indigo-800">3教科平均偏差値 (現在の値: {latestDeviation})</strong> を自動判定し、教員が登録したレベル帯（推奨偏差値）に合致する教材だけを動的に選出しておすすめします。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1.5">
              <div className="p-3 bg-white/70 backdrop-blur-xs rounded-xl border border-indigo-100/30">
                <span className="font-extrabold text-indigo-700 text-[10px] block mb-1">① 取り組みを開始する</span>
                <p className="text-gray-500 leading-normal text-[10px] font-medium">
                  自分に合う教材を選び、カード下部の<strong>【取り組みを始める（登録）】</strong>ボタンを押します。
                </p>
              </div>
              <div className="p-3 bg-white/70 backdrop-blur-xs rounded-xl border border-indigo-100/30">
                <span className="font-extrabold text-indigo-700 text-[10px] block mb-1">② 日常学習での選択と記録</span>
                <p className="text-gray-500 leading-normal text-[10px] font-medium">
                  登録すると、学習記録フォームでその教材を指定して、何ページまで進めたかを登録・蓄積できるようになります。
                </p>
              </div>
              <div className="p-3 bg-white/70 backdrop-blur-xs rounded-xl border border-indigo-100/30">
                <span className="font-extrabold text-indigo-700 text-[10px] block mb-1">③ 進捗＆アドバイスを連動</span>
                <p className="text-gray-500 leading-normal text-[10px] font-medium">
                  <strong>「取り組み中の問題集」タブ</strong>で、自分自身の進捗率(%)や累積学習時間、教員からのアドバイスを視覚的に一元管理できます。
                </p>
              </div>
            </div>
          </div>

          {recommendedWorkbooks.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <BookMarked className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-600">現在マッチするおすすめ問題集がありません</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                {recentResult 
                  ? `現在の偏差値「${latestDeviation}」に対応したお勧め問題集が、現在先生によって登録されていません。`
                  : '模試成績が登録されていないか、対応する問題集の推奨判定偏差値範囲に合致していません。まずは模試結果を待つか、自学を進めましょう。'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedWorkbooks.map((book) => {
                const isRegistered = !book.id ? false : (user.registered_workbooks || []).includes(book.id);
                return (
                  <div key={book.id} className="p-5 border border-indigo-100 bg-indigo-50/20 rounded-2xl flex flex-col justify-between hover:shadow-md transition-all text-left">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                          {book.subject}
                        </span>
                        <span className="text-[11px] font-mono text-gray-400 bg-white px-2 py-0.5 rounded border border-gray-100">
                          ID: {book.id?.slice(0, 5) || 'temp'}
                        </span>
                      </div>
                      
                      <h4 className="text-base font-black text-gray-800 tracking-tight leading-snug line-clamp-2 mb-2">{book.title}</h4>
                      
                      {book.instructions && (
                        <div className="mt-2.5 bg-white p-2.5 text-indigo-950 rounded-xl text-xs font-medium space-y-1 border border-indigo-100/40">
                          <span className="font-bold text-[10px] text-indigo-600 flex items-center">
                            <Compass className="h-3.5 w-3.5 mr-1 text-indigo-500 shrink-0" /> 使い方・アドバイス:
                          </span>
                          <p className="leading-relaxed whitespace-pre-wrap">{book.instructions}</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-indigo-100/30">
                      <div className="flex items-center justify-between text-xs mb-3">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase font-mono tracking-wider">推奨偏差値帯</span>
                        <span className="font-extrabold text-indigo-800 font-mono">
                          {book.min_deviation} 〜 {book.max_deviation}
                        </span>
                      </div>

                      {isRegistered ? (
                        <button
                          type="button"
                          disabled
                          className="w-full flex items-center justify-center space-x-1 py-2 px-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/50 font-bold text-xs"
                        >
                          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span>現在取り組み中（登録済）</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRegisterWorkbook(book.id!, book.title)}
                          className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition duration-150 shadow-sm"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          <span>取り組みを始める（登録）</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'active_workbooks' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="active-workbooks-container">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">現在取り組み中の問題集</h3>
              <p className="text-xs text-gray-500">
                あなたが登録した問題集です。日常の学習記録を付ける際に選択可能で、ページ進捗や進捗率（％）が自動で集計されます。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomWbOpen(true)}
              className="mt-2 sm:mt-0 font-bold px-3 py-1.5 rounded-xl text-xs bg-indigo-650 hover:bg-indigo-700 text-white flex items-center space-x-1.5 transition shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>マイ参考書を新規追加</span>
            </button>
          </div>

          {activeStudentWorkbooks.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <BookMarked className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-semibold text-gray-655">取り組み中の問題集がありません</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                「おすすめ問題集」タブからあなたに合う問題集を選んで登録するか、右上の「マイ参考書を新規追加」ボタンから、お手持ちの教材を登録して取り組みを開始しましょう！
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeStudentWorkbooks.map((book) => {
                const bookLogs = studyLogs.filter((log) => log.workbookId === book.id);
                const totalMinutes = bookLogs.reduce((sum, log) => sum + log.duration, 0);
                const totalHours = (totalMinutes / 60).toFixed(1);
                
                const maxPageCompleted = bookLogs.length > 0 
                  ? Math.max(...bookLogs.map((l) => l.pagesTo || 0), 0) 
                  : 0;
                  
                const totalPages = book.totalPages || 0;
                const progressPercentage = totalPages > 0 
                  ? Math.min(100, Math.round((maxPageCompleted / totalPages) * 100)) 
                  : 0;

                const progressColors: Record<string, string> = {
                  英語: 'bg-emerald-500',
                  数学: 'bg-blue-500',
                  国語: 'bg-red-500',
                  理科: 'bg-teal-500',
                  社会: 'bg-amber-500',
                  その他: 'bg-purple-500'
                };
                
                const colorClass = progressColors[book.subject] || 'bg-indigo-600';

                return (
                  <div key={book.id} className="p-5 border border-gray-150 bg-white rounded-2xl flex flex-col justify-between hover:shadow-md transition-all text-left">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100">
                            {book.subject}
                          </span>
                          {book.createdBy === user.uid ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-805 border border-amber-100">
                              マイ教材
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-805 border border-blue-100">
                              教員推奨
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteWb({
                              id: book.id!,
                              title: book.title,
                              isCustom: book.createdBy === user.uid
                            });
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="取り組み解除・削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <h4 className="text-base font-black text-gray-800 tracking-tight leading-snug line-clamp-2 mb-3">
                        {book.title}
                      </h4>

                      <div className="space-y-2 mt-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500 font-medium">現在の進捗率:</span>
                          <span className="font-mono font-black text-indigo-700 text-sm">{progressPercentage}%</span>
                        </div>
                        
                        {/* Progress slider style bar */}
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`${colorClass} h-full transition-all duration-500`} 
                            style={{ width: `${totalPages > 0 ? progressPercentage : (maxPageCompleted > 0 ? 100 : 0)}%` }} 
                          />
                        </div>

                        <div className="flex justify-between items-center text-xs font-mono text-gray-605 pt-1">
                          <span>累計学習時間: <strong className="text-gray-900 font-bold">{totalHours}</strong>h</span>
                          {totalPages > 0 ? (
                            <span>進捗: <strong className="text-indigo-600 font-bold">{maxPageCompleted}</strong> / {totalPages}p</span>
                          ) : (
                            <span>到達: <strong className="text-gray-750 font-bold">{maxPageCompleted}</strong>p <span className="text-[9px] font-sans text-gray-400 font-normal">(総数未設定)</span></span>
                          )}
                        </div>
                      </div>

                      {book.instructions && book.createdBy !== user.uid && (
                        <div className="mt-3 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100/20 text-[11px] text-indigo-950 font-medium font-sans">
                          <span className="font-bold text-[10px] text-indigo-600 flex items-center mb-0.5">
                            <Compass className="h-3 w-3 mr-1 text-indigo-500" /> 指導・使い方アドバイス:
                          </span>
                          <p className="leading-relaxed text-gray-700 whitespace-pre-wrap">{book.instructions}</p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                      <span>登録日: {book.instructions === '自主学習用登録教材' ? '自作教材' : '推奨教材'}</span>
                      <span className="font-mono">ID: {book.id?.slice(0, 6)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Student Custom Workbook Creation Modal */}
      {isCustomWbOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-2xl max-w-sm w-full space-y-4 relative text-left">
            <button
              type="button"
              onClick={() => setIsCustomWbOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-105 text-gray-400 transition"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-2.5">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <BookOpen className="h-5 w-5" />
              </span>
              <h4 className="text-base font-black text-gray-900">マイ参考書・問題集を追加</h4>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed">
              自分が所持している市販教材や問題集をここに登録できます。登録すると、学習記録を付ける際に選択可能になり、ページ進捗の自動計算や到達度（％）を測れるようになります。
            </p>
            
            <form onSubmit={handleCreateCustomWorkbook} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-gray-650 mb-1">問題集の名称・書籍名</label>
                <input
                  type="text"
                  required
                  placeholder="例: 青チャート 数学 I+A"
                  value={newWbTitle}
                  onChange={(e) => setNewWbTitle(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-650 mb-1">対応する教科</label>
                  <select
                    value={newWbSubject}
                    onChange={(e) => setNewWbSubject(e.target.value as StudySubject)}
                    className="block w-full px-2 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  >
                    <option value="英語">英語</option>
                    <option value="数学">数学</option>
                    <option value="国語">国語</option>
                    <option value="理科">理科</option>
                    <option value="社会">社会</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-650 mb-1">総ページ数 (任意)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="例: 350"
                    value={newWbTotalPages}
                    onChange={(e) => setNewWbTotalPages(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingCustomWb}
                className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 rounded-lg bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs transition shadow-xs"
              >
                {savingCustomWb ? <span>登録中...</span> : <span>マイ教材として新規追加</span>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Unregister Confirmation Modal */}
      {confirmDeleteWb && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-2xl max-w-sm w-full space-y-4 relative text-left">
            <button
              type="button"
              onClick={() => setConfirmDeleteWb(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-105 text-gray-400 transition"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-2.5">
              <span className="p-1.5 bg-red-50 text-red-650 rounded-lg">
                <Trash2 className="h-5 w-5" />
              </span>
              <h4 className="text-base font-black text-gray-900">
                {confirmDeleteWb.isCustom ? 'マイ教材の完全削除' : '取り組み教材の解除'}
              </h4>
            </div>
            
            <div className="text-xs text-gray-650 leading-relaxed space-y-2">
              <p>
                「<strong className="text-gray-900 font-bold">{confirmDeleteWb.title}</strong>」の登録を解除します。
              </p>
              {confirmDeleteWb.isCustom ? (
                <p className="bg-red-50 text-red-700/80 p-2.5 rounded-lg border border-red-100/50 font-semibold text-[11px] leading-normal">
                  ⚠️ この教材はご自身で登録された「マイ教材」であるため、取り組みを解除すると<strong className="text-red-800 underline">教材の登録データおよび進捗が完全に削除</strong>されます。この操作は取り消せません。
                </p>
              ) : (
                <p className="bg-slate-50 text-slate-500 p-2.5 rounded-lg border border-slate-100 font-medium">
                  ※この教材は教員登録の推奨問題集です。リストから除外されますが、教材自体のデータは削除されません。またいつでも再登録可能です。
                </p>
              )}
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteWb(null)}
                className="flex-1 py-1.5 px-3 border border-gray-200 hover:bg-gray-50 rounded-lg text-xs font-bold text-gray-500 transition"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = confirmDeleteWb.id;
                  const targetTitle = confirmDeleteWb.title;
                  setConfirmDeleteWb(null);
                  await handleUnregisterWorkbook(targetId, targetTitle);
                }}
                className="flex-1 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-xs"
              >
                {confirmDeleteWb.isCustom ? '完全に削除する' : '登録を解除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Mobile Sticky Floating Action Button to jump to Quick Log panel */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setIsQuickPanelVisible(true);
            setTimeout(() => {
              const el = document.getElementById('quick-recording-panel');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          }}
          className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 hover:scale-105 active:scale-95 text-white font-extrabold py-3 px-4 rounded-full shadow-2xl border border-indigo-500/35 flex items-center space-x-2 transition-all cursor-pointer"
        >
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-450"></span>
          </span>
          <Clock className="h-5 w-5 animate-pulse shrink-0" />
          <span className="text-xs uppercase font-extrabold tracking-wider">⚡タイマー記録</span>
        </button>
      </div>
    </div>
  );
}
