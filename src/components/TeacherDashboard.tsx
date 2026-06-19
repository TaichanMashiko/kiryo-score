import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, getDocs, addDoc, onSnapshot, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { User, MockResult, StudyLog, Workbook } from '../types';
import Papa from 'papaparse';
import { motion } from 'motion/react';
import { 
  Users, BookOpen, Upload, Plus, FileText, CheckCircle2, 
  AlertCircle, ChevronRight, Search, BarChart3, Clock, Trash2, 
  Sparkles, Layers, ListFilter, Edit3, X, MessageSquare, Award,
  Check, Smile, HelpCircle, Flame, Calendar
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { normalizeToHalfWidthKana, padLeftWithZeros } from '../utils/kanaUtils';

export default function TeacherDashboard() {
  // DB States
  const [students, setStudents] = useState<User[]>([]);
  const [allLogs, setAllLogs] = useState<StudyLog[]>([]);
  const [allResults, setAllResults] = useState<MockResult[]>([]);
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);

  // CSV Import States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [examName, setExamName] = useState('第1回ベネッセ総合学力テスト');
  const [examDate, setExamDate] = useState('2025年度');
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [dragActive, setDragActive] = useState(false);

  // Workbook Form & Editing States
  const [wbTitle, setWbTitle] = useState('');
  const [wbSubject, setWbSubject] = useState('英語');
  const [wbMinDev, setWbMinDev] = useState<number | ''>(50);
  const [wbMaxDev, setWbMaxDev] = useState<number | ''>(70);
  const [wbTotalPages, setWbTotalPages] = useState<number | ''>('');
  const [wbInstructions, setWbInstructions] = useState('');
  const [savingWb, setSavingWb] = useState(false);

  // Workbook Edit Modal States
  const [editingWorkbook, setEditingWorkbook] = useState<Workbook | null>(null);
  const [editWbTitle, setEditWbTitle] = useState('');
  const [editWbSubject, setEditWbSubject] = useState('英語');
  const [editWbMinDev, setEditWbMinDev] = useState<number | ''>(50);
  const [editWbMaxDev, setEditWbMaxDev] = useState<number | ''>(70);
  const [editWbTotalPages, setEditWbTotalPages] = useState<number | ''>('');
  const [editWbInstructions, setEditWbInstructions] = useState('');

  // UI Tab & Modal States
  const [activeTab, setActiveTab] = useState<'students' | 'workbooks' | 'csv-import'>('students');
  const [selectedStudentForLog, setSelectedStudentForLog] = useState<User | null>(null);
  const [commentInputMap, setCommentInputMap] = useState<Record<string, string>>({});

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');

  // Student Edit States
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editKanaName, setEditKanaName] = useState('');
  const [editGrade, setEditGrade] = useState('高校３年生');
  const [editClass, setEditClass] = useState('');
  const [editAttendance, setEditAttendance] = useState('');

  // Notification & Confirmation Modal States
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
  }>({
    show: false,
    type: 'success',
    message: ''
  });

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: 'student' | 'workbook';
    targetId: string;
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'student',
    targetId: '',
    title: '',
    message: ''
  });

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ show: true, type, message });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Load and Subscribe data
  useEffect(() => {
    // 1. Fetch and subscribe to all students
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      const studs: User[] = [];
      snapshot.forEach((docSnap) => {
        const u = docSnap.data() as User;
        if (u.role === 'student') {
          studs.push({ ...u, uid: docSnap.id });
        }
      });
      // Sort: Grade -> Class -> Attendance Number
      studs.sort((a, b) => {
        const gradeComp = (a.grade || '').localeCompare(b.grade || '');
        if (gradeComp !== 0) return gradeComp;
        
        const classComp = (a.class || '').localeCompare(b.class || '');
        if (classComp !== 0) return classComp;

        return (a.attendance_number || '').localeCompare(b.attendance_number || '');
      });
      setStudents(studs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    // 2. Fetch and subscribe to all study logs
    const logsRef = collection(db, 'study_logs');
    const unsubscribeLogs = onSnapshot(logsRef, (snapshot) => {
      const logs: StudyLog[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as StudyLog);
      });
      setAllLogs(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'study_logs');
    });

    // 3. Fetch and subscribe to all mock results
    const resultsRef = collection(db, 'mock_results');
    const unsubscribeResults = onSnapshot(resultsRef, (snapshot) => {
      const res: MockResult[] = [];
      snapshot.forEach((docSnap) => {
        res.push({ id: docSnap.id, ...docSnap.data() } as MockResult);
      });
      setAllResults(res);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'mock_results');
    });

    // 4. Fetch and subscribe to all workbooks
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

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
      unsubscribeResults();
      unsubscribeWorkbooks();
    };
  }, []);

  // Compute stats per student
  const studentDataList = students.map((std) => {
    // Study duration cumulative
    const stdLogs = allLogs.filter((log) => log.uid === std.uid);
    const cumulativeMinutes = stdLogs.reduce((sum, log) => sum + log.duration, 0);
    const cumulativeHours = (cumulativeMinutes / 60).toFixed(1);

    // Latest mock result
    const stdResults = allResults.filter((res) => res.uid === std.uid);
    // Supposing sorted chronologically elsewhere, let's take the latest item
    const latestResult = stdResults.length > 0 ? stdResults[stdResults.length - 1] : null;
    const latestAverageDeviation = latestResult?.subject_deviations?.average || null;

    return {
      ...std,
      studyHours: Number(cumulativeHours),
      latestDev: latestAverageDeviation,
      recentExamName: latestResult?.exam_name || '未登録'
    };
  });

  // Unique lists for class filters
  const availableClasses = Array.from(new Set(students.map((s) => s.class).filter(Boolean)));

  // Save Feedback: Comment
  const handleAddComment = async (logId: string) => {
    const text = commentInputMap[logId] || '';
    if (!text.trim()) return;

    try {
      const logItem = allLogs.find((l) => l.id === logId);
      if (!logItem) return;

      const currentComments = logItem.comments || [];
      const newComment = {
        id: Math.random().toString(36).substring(2, 11),
        teacherId: 'teacher',
        teacherName: '指導担当教員',
        comment: text.trim(),
        createdAt: new Date().toISOString()
      };

      const updatedComments = [...currentComments, newComment];

      const logDocRef = doc(db, 'study_logs', logId);
      await setDoc(logDocRef, { comments: updatedComments }, { merge: true });

      // Clear input state
      setCommentInputMap((prev) => ({ ...prev, [logId]: '' }));
      showNotification('success', '生徒の学習記録にコメントを投稿しました！');
    } catch (err: any) {
      console.error(err);
      showNotification('error', `コメント送信エラー: ${err.message}`);
    }
  };

  // Save Feedback: Reaction
  const handleAddReaction = async (logId: string, emoji: string) => {
    try {
      const logDocRef = doc(db, 'study_logs', logId);
      await setDoc(logDocRef, { reaction: emoji }, { merge: true });
      showNotification('success', `リアクション「${emoji}」を送信しました。`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `リアクション送信エラー: ${err.message}`);
    }
  };

  // Filter students
  const filteredStudents = studentDataList.filter((std) => {
    const matchesSearch = 
      std.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      std.kana_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (std.attendance_number || '').includes(searchQuery);

    const matchesClass = classFilter === 'all' || std.class === classFilter;

    return matchesSearch && matchesClass;
  });

  // Filter out workbooks created by students, so teachers only see system/teacher created workbooks
  const studentUids = students.map((s) => s.uid);
  const teacherWorkbooks = workbooks.filter((book) => !studentUids.includes(book.createdBy));

  // Save new Workbook recommendation
  const handleSaveWorkbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wbTitle.trim()) return;
    setSavingWb(true);

    try {
      const payload: Workbook = {
        title: wbTitle.trim(),
        subject: wbSubject,
        min_deviation: wbMinDev === '' ? 30 : Number(wbMinDev),
        max_deviation: wbMaxDev === '' ? 85 : Number(wbMaxDev),
        ...(wbTotalPages ? { totalPages: Number(wbTotalPages) } : {}),
        instructions: wbInstructions.trim()
      };
      await addDoc(collection(db, 'workbooks'), payload);
      setWbTitle('');
      setWbMinDev(50);
      setWbMaxDev(70);
      setWbTotalPages('');
      setWbInstructions('');
      showNotification('success', 'おすすめ問題集を登録しました！');
    } catch (err: any) {
      console.error(err);
      showNotification('error', `問題集登録エラー: ${err.message}`);
    } finally {
      setSavingWb(false);
    }
  };

  // Update Workbook recommendation
  const handleUpdateWorkbook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkbook || !editingWorkbook.id) return;
    if (!editWbTitle.trim()) {
      showNotification('error', '問題集の表題を入力してください。');
      return;
    }

    try {
      const wbRef = doc(db, 'workbooks', editingWorkbook.id);
      await updateDoc(wbRef, {
        title: editWbTitle.trim(),
        subject: editWbSubject,
        min_deviation: editWbMinDev === '' ? 30 : Number(editWbMinDev),
        max_deviation: editWbMaxDev === '' ? 85 : Number(editWbMaxDev),
        totalPages: editWbTotalPages === '' ? null : Number(editWbTotalPages),
        instructions: editWbInstructions.trim()
      });
      setEditingWorkbook(null);
      showNotification('success', 'おすすめ問題集を更新しました！');
    } catch (err: any) {
      console.error(err);
      showNotification('error', `更新エラー: ${err.message}`);
    }
  };

  // Trigger Workbook Delete Confirmation Modal
  const triggerDeleteWorkbook = (wb: Workbook) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'workbook',
      targetId: wb.id || '',
      title: '問題集データの削除',
      message: `おすすめ問題集「${wb.title}」を削除してもよろしいですか？この操作は取り消せません。`
    });
  };

  // Student Update & Delete Handlers
  const handleEditStudent = (student: User) => {
    setEditingStudent(student);
    setEditName(student.name);
    setEditKanaName(student.kana_name || '');
    setEditGrade(student.grade || '高校３年生');
    setEditClass(student.class || '');
    setEditAttendance(student.attendance_number || '');
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    try {
      const normalizedKana = normalizeToHalfWidthKana(editKanaName);
      const paddedClass = padLeftWithZeros(editClass, 2);
      const paddedAttendance = padLeftWithZeros(editAttendance, 4);

      if (!editName.trim()) throw new Error('漢字氏名を入力してください。');
      if (!normalizedKana) throw new Error('有効なフリガナの入力が必要です。');
      if (paddedClass.length !== 2) throw new Error('組は2桁の数値で、05のように入力してください。');
      if (paddedAttendance.length !== 4) throw new Error('出席番号は4桁の数値で、0032のように入力してください。');

      const userRef = doc(db, 'users', editingStudent.uid);
      await setDoc(userRef, {
        ...editingStudent,
        name: editName.trim(),
        kana_name: normalizedKana,
        grade: editGrade,
        class: paddedClass,
        attendance_number: paddedAttendance
      }, { merge: true });

      setEditingStudent(null);
      showNotification('success', '生徒情報を更新しました。');
    } catch (err: any) {
      showNotification('error', `更新エラー: ${err.message}`);
    }
  };

  const triggerDeleteStudent = (student: User) => {
    setDeleteConfirmation({
      isOpen: true,
      type: 'student',
      targetId: student.uid,
      title: '生徒アカウントの削除',
      message: `${student.class ? `${student.class}組 ` : ''}${student.attendance_number ? `${parseInt(student.attendance_number)}番 ` : ''}${student.name} さんの生徒データを削除してもよろしいですか？\n※登録済みの模試成績や学習記録データはそのまま残りますが、生徒アカウント情報自体が削除されログインできなくなります。`
    });
  };

  const executeDelete = async () => {
    const { type, targetId } = deleteConfirmation;
    try {
      if (type === 'student') {
        const userRef = doc(db, 'users', targetId);
        await deleteDoc(userRef);
        showNotification('success', '生徒アカウント情報を正常に削除しました。');
      } else if (type === 'workbook') {
        const wbRef = doc(db, 'workbooks', targetId);
        await deleteDoc(wbRef);
        showNotification('success', 'おすすめ問題集を削除しました。');
      }
    } catch (err: any) {
      showNotification('error', `削除エラー: ${err.message}`);
    } finally {
      setDeleteConfirmation((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Handle Drag & Drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith('.csv')) {
        setCsvFile(file);
      } else {
        alert('CSVファイルのみ選択可能です。');
      }
    }
  };

  // CSV Import matching logic
  const handleImportCSV = () => {
    if (!csvFile) return;
    setImporting(true);
    setImportLogs([]);
    setImportStatus('idle');

    Papa.parse(csvFile, {
      skipEmptyLines: true,
      encoding: 'Shift-JIS', // Standard encoding of Benesse downloaded CSVs
      complete: async (results) => {
        const rows = results.data as string[][];
        if (rows.length < 2) {
          setImportLogs(['エラー: CSVのデータ行が足りません（ヘッダー行含め2行以上必要）。']);
          setImportStatus('error');
          setImporting(false);
          return;
        }

        const headerLine = rows[1]; // 2行目が成績ヘッダー行
        const dataLines = rows.slice(2);

        // Find necessary columns
        const colClass = headerLine.indexOf('組');
        const colNo = headerLine.indexOf('番号');
        const colName = headerLine.indexOf('氏名');
        const colJapanese = headerLine.indexOf('国語計');
        const colMath = headerLine.indexOf('数学計');
        const colEnglish = headerLine.indexOf('英語計');
        const colSocial = headerLine.indexOf('地歴・公民計');
        const colScience = headerLine.indexOf('理科計');
        const colInfo = headerLine.indexOf('情報計');

        if (colClass === -1 || colNo === -1) {
          const colsStr = headerLine.join(', ');
          setImportLogs([
            `エラー: CSVヘッダー「組」「番号」が見つかりませんでした。`,
            `解析された列項目: [${colsStr.substring(0, 150)}...]`,
            `※1行目は不要なタイトル行としてスキップされ、2行目をヘッダー項目として解析しています。CSVの2行目に「組」「番号」があるかご確認ください。`
          ]);
          setImportStatus('error');
          setImporting(false);
          return;
        }

        const logs: string[] = [`インポート開始: 全 ${dataLines.length} 名の成績データを解析中...`];
        let successCount = 0;
        let failCount = 0;

        // Sequence of insertion
        for (let i = 0; i < dataLines.length; i++) {
          const row = dataLines[i];
          if (row.length < 2) continue; // Skip empty rows

          // Class string parsing
          const rawClass = (row[colClass] || '').trim();

          // Attendance number parsing
          const rawNo = (row[colNo] || '').trim();

          const rawName = colName !== -1 ? (row[colName] || '').trim() : '';

          // Look up matching student in already subscription-managed students using zero-padded matching
          const matchedStudent = students.find((s) => {
            const dbClass = padLeftWithZeros(s.class || '', 2);
            const dbNo = padLeftWithZeros(s.attendance_number || '', 4);
            const csvClass = padLeftWithZeros(rawClass || '', 2);
            const csvNo = padLeftWithZeros(rawNo || '', 4);
            return dbClass === csvClass && dbNo === csvNo;
          });

          if (!matchedStudent) {
            logs.push(`⚠️ 行 ${i + 3}: 紐付け失敗 — クラス ${padLeftWithZeros(rawClass, 2)}組 番号 ${padLeftWithZeros(rawNo, 4)} (${rawName}) に一致する生徒アカウントがありません。`);
            failCount++;
            continue;
          }

          // Fetch dev values safely
          const parseDev = (val?: string) => {
            const num = Number(val);
            return isNaN(num) || !val ? 0 : num;
          };

          const deviations = {
            japanese: colJapanese !== -1 ? parseDev(row[colJapanese]) : 0,
            math: colMath !== -1 ? parseDev(row[colMath]) : 0,
            english: colEnglish !== -1 ? parseDev(row[colEnglish]) : 0,
            social: colSocial !== -1 ? parseDev(row[colSocial]) : 0,
            science: colScience !== -1 ? parseDev(row[colScience]) : 0,
            information: colInfo !== -1 ? parseDev(row[colInfo]) : 0,
            average: 0
          };

          // Calculate Average Deviation (Japanese, Math, English)
          const coreSubjects = [];
          if (deviations.japanese) coreSubjects.push(deviations.japanese);
          if (deviations.math) coreSubjects.push(deviations.math);
          if (deviations.english) coreSubjects.push(deviations.english);

          const averageDev = coreSubjects.length > 0
            ? Math.round((coreSubjects.reduce((s, v) => s + v, 0) / coreSubjects.length) * 10) / 10
            : 0;

          deviations.average = averageDev;

          try {
            const resultPayload: MockResult = {
              uid: matchedStudent.uid,
              exam_name: examName.trim(),
              exam_date: examDate.trim(),
              subject_deviations: deviations
            };

            await addDoc(collection(db, 'mock_results'), resultPayload);
            logs.push(`✅ 行 ${i + 3}: ${matchedStudent.class}組 ${parseInt(matchedStudent.attendance_number || '0')}番 (${matchedStudent.name}) の成績を追加しました。 3教科平均偏差値: ${averageDev}`);
            successCount++;
          } catch (docErr: any) {
            logs.push(`❌ 行 ${i + 3}: ドキュメント登録中にエラー: ${docErr.message}`);
            failCount++;
          }
        }

        logs.push(`\n🎉 処理完了! インポート成功: ${successCount} 件, 失敗: ${failCount} 件`);
        setImportLogs(logs);
        setImportStatus(failCount === 0 ? 'success' : 'info');
        setImporting(false);
        setCsvFile(null);
        showNotification('success', `インポート完了しました！(成功: ${successCount}件, 失敗: ${failCount}件)`);
      },
      error: (parseErr) => {
        console.error(parseErr);
        setImportLogs([`エラー: CSVの読み込みに失敗しました。 ${parseErr.message}`]);
        setImportStatus('error');
        setImporting(false);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="teacher-dashboard">
      
      {/* Title & Tabs Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-150 pb-5 gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center space-x-2.5">
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Layers className="h-6 w-6" />
            </span>
            <span>教員管理ダッシュボード</span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">生徒の日常学習の進捗管理、指導用フィードバック、および模試データの管理ができます。</p>
        </div>
        
        {/* Tab switcher buttons */}
        <div className="flex bg-gray-100 p-1 rounded-xl self-start md:self-auto shadow-inner border border-gray-200/50 max-w-full overflow-x-auto scrollbar-none whitespace-nowrap">
          <button
            onClick={() => setActiveTab('students')}
            className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 ${
              activeTab === 'students' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-805'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>生徒指導＆カルテ</span>
          </button>
          
          <button
            onClick={() => setActiveTab('workbooks')}
            className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 ${
              activeTab === 'workbooks' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-805'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>教材おすすめ設定</span>
          </button>
          
          <button
            onClick={() => setActiveTab('csv-import')}
            className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shrink-0 ${
              activeTab === 'csv-import' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-805'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>成績CSV取り込み</span>
          </button>
        </div>
      </div>

      {/* ----------------- TAB 1: STUDENTS & GUIDANCE ----------------- */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-50 pb-4 mb-6 gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight flex items-center space-x-2">
                  <Users className="h-4 w-4 text-indigo-600" />
                  <span>担当クラス生徒一覧</span>
                </h3>
                <p className="text-xs text-gray-500">学習時間ランキング・直近模試の偏差値をリアルタイムで確認できます。各生徒の「指導カルテ」から個別指示・反応を登録できます。</p>
              </div>

              {/* Advanced search and filters */}
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-56 text-xs">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 font-bold">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="氏名・カタカナ・出席番号"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 bg-gray-50/50 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>

                <div className="flex items-center space-x-1 sm:w-32 text-xs">
                  <span className="text-gray-400"><ListFilter className="h-4 w-4" /></span>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="block w-full px-2 py-2 border border-gray-200 bg-white rounded-xl focus:outline-none text-xs"
                  >
                    <option value="all">すべての組</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>{cls}組</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Student list grid format / responsive table */}
            <div className="overflow-x-auto" id="students-table">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Users className="h-10 w-10 mx-auto text-gray-200 mb-2" />
                  <p className="text-sm font-semibold">該当する生徒が見つかりません</p>
                  <p className="text-xs">検索条件をカスタマイズしてください。</p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-100 text-left">
                  <thead>
                    <tr className="text-[11px] font-extrabold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="pb-3 text-center">クラス学籍</th>
                      <th className="pb-3">生徒氏名</th>
                      <th className="pb-3 text-center">累計勉強時間</th>
                      <th className="pb-3 text-center">国数英平均偏差値</th>
                      <th className="pb-3 text-right">受験模試名</th>
                      <th className="pb-3 text-right pr-2">指導カルテ・操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-sm">
                    {filteredStudents.map((std, idx) => (
                      <tr key={std.uid} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3.5 text-center font-mono font-bold text-gray-600">
                          {std.class}組 - {parseInt(std.attendance_number || '0')}番
                        </td>
                        <td className="py-3.5">
                          <span className="font-semibold text-gray-900 block leading-tight">{std.name}</span>
                          <span className="text-xs text-gray-400 font-mono tracking-wider">{std.kana_name}</span>
                        </td>
                        <td className="py-3.5 text-center">
                          <span className="inline-flex items-center space-x-1 text-gray-900 font-extrabold font-mono">
                            <Clock className="h-3.5 w-3.5 text-indigo-500" />
                            <span>{std.studyHours}</span>
                            <span className="text-[10px] text-gray-400 font-sans font-bold">h</span>
                          </span>
                        </td>
                        <td className="py-3.5 text-center">
                          {std.latestDev !== null ? (
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full font-mono font-black text-xs ${
                              std.latestDev >= 60 
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                                : std.latestDev >= 45 
                                  ? 'bg-blue-50 text-blue-800 border border-blue-100' 
                                  : 'bg-red-50 text-red-800 border border-red-100'
                            }`}>
                              偏差値 {std.latestDev}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 font-mono">未受験</span>
                          )}
                        </td>
                        <td className="py-3.5 text-right text-xs text-gray-550 truncate max-w-44">
                          {std.recentExamName}
                        </td>
                        <td className="py-3.5 text-right space-x-1.5 pr-2 whitespace-nowrap">
                          {/* Main Portfolio Karte Link */}
                          <button
                            onClick={() => setSelectedStudentForLog(std)}
                            className="inline-flex items-center space-x-1 text-xs font-bold px-2.5 py-1 text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 rounded-lg transition-all"
                            title="学習カルテとフィードバックを開く"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>カルテ指導</span>
                          </button>
                          
                          <button
                            onClick={() => handleEditStudent(std)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-1 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
                            title="生徒基本データを編集"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          
                          <button
                            onClick={() => triggerDeleteStudent(std)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold px-2 py-1 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg transition-all"
                            title="生徒アカウントを削除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: WORKBOOKS MANAGEMENT ----------------- */}
      {activeTab === 'workbooks' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="workbook-registration">
          <div className="border-b border-gray-100 pb-3 mb-6">
            <h3 className="text-lg font-extrabold text-gray-900 flex items-center space-x-2">
              <Layers className="h-5 w-5 text-indigo-600" />
              <span>レベル判定別おすすめ教材・問題集の管理</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              模試の偏差値範囲を設定して登録すると、合致する学力レベルの生徒に対して、問題集が「自動マッチング」されておすすめ欄に表示されます。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Form to insert (takes 1 col) */}
            <form onSubmit={handleSaveWorkbook} className="lg:col-span-1 space-y-4 bg-gray-50/50 p-5 rounded-xl border border-gray-150">
              <span className="text-xs font-extrabold text-indigo-700 block uppercase tracking-wider">問題集を新規配付</span>
              
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">問題集の名称</label>
                <input
                  type="text"
                  required
                  placeholder="例：青チャート 数学I+A"
                  value={wbTitle}
                  onChange={(e) => setWbTitle(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">対象教科</label>
                  <select
                    value={wbSubject}
                    onChange={(e) => setWbSubject(e.target.value)}
                    className="block w-full px-2 py-2 border border-gray-200 bg-white rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="英語">英語</option>
                    <option value="数学">数学</option>
                    <option value="国語">国語</option>
                    <option value="理科">理科</option>
                    <option value="社会">社会</option>
                    <option value="情報">情報</option>
                    <option value="その他">その他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">総ページ数 (任意)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="例: 240"
                    value={wbTotalPages}
                    onChange={(e) => setWbTotalPages(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">推奨偏差値 (下限)</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="80"
                    value={wbMinDev}
                    onChange={(e) => setWbMinDev(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">推奨偏差値 (上限)</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="85"
                    value={wbMaxDev}
                    onChange={(e) => setWbMaxDev(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  教材の取り組み方・アドバイス (取説)
                </label>
                <textarea
                  placeholder="この教材を使ってどのような手順で勉強するかのコーチング、ページごとの課題などを記載してください..."
                  value={wbInstructions}
                  rows={4}
                  onChange={(e) => setWbInstructions(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={savingWb}
                className="w-full flex justify-center items-center space-x-2 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                {savingWb ? <span>登録中...</span> : <span>おすすめ問題集を登録</span>}
              </button>
            </form>

            {/* Already registered list (takes 2 cols) */}
            <div className="lg:col-span-2 space-y-4">
              <span className="text-xs font-extrabold text-gray-400 block uppercase tracking-wider">配付中のおすすめ問題集 ({teacherWorkbooks.length}冊)</span>
              
              {teacherWorkbooks.length === 0 ? (
                <div className="text-center py-16 text-gray-400 border border-dashed rounded-xl p-8 bg-gray-50">
                  <BookOpen className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm font-semibold text-gray-650">推奨用の問題集は登録されていません</p>
                  <p className="text-xs mt-1">左のフォームから課題登録を行ってください。</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
                  {teacherWorkbooks.map((book) => (
                    <div key={book.id} className="p-4 bg-white border border-gray-150 rounded-xl flex flex-col justify-between hover:shadow-sm transition-all text-xs relative">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded text-[10px]">
                            {book.subject}
                          </span>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => {
                                setEditingWorkbook(book);
                                setEditWbTitle(book.title);
                                setEditWbSubject(book.subject);
                                setEditWbMinDev(book.min_deviation);
                                setEditWbMaxDev(book.max_deviation);
                                setEditWbTotalPages(book.totalPages !== undefined ? book.totalPages : '');
                                setEditWbInstructions(book.instructions || '');
                              }}
                              className="text-gray-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition-all animate-none"
                              title="教材情報を編集"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => triggerDeleteWorkbook(book)}
                              className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-all"
                              title="この教材のおすすめを終了"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <h4 className="font-extrabold text-sm text-gray-850 tracking-tight">{book.title}</h4>
                        <div className="flex items-center space-x-3 text-gray-400">
                          {book.totalPages && (
                            <span className="font-semibold font-mono">総ページ: {book.totalPages}p</span>
                          )}
                          <span className="font-extrabold font-mono text-indigo-700">対象偏差値: {book.min_deviation} 〜 {book.max_deviation}</span>
                        </div>
                        {book.instructions && (
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 mt-2 text-gray-600 leading-normal whitespace-pre-line text-[11px]">
                            <b className="text-gray-700 block mb-0.5">💡 教法・取り組みアドバイス:</b>
                            {book.instructions}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: CSV IMPORT ----------------- */}
      {activeTab === 'csv-import' && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm" id="csv-importer">
          <div className="border-b border-gray-100 pb-3 mb-6">
            <h3 className="text-lg font-extrabold text-gray-900 flex items-center space-x-2">
              <Upload className="h-4 w-4 text-indigo-600" />
              <span>成績CSV一括流し込み（ベネッセ模試形式）</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              ベネッセ総合学力テストで書き出された2行ヘッダー形式の成績csvを一括アップロードし、出席番号・組と自動連携して生徒のdbに成績をインポートします。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-750 mb-1">対象模試名</label>
                <input
                  type="text"
                  required
                  placeholder="例：第1回ベネッセ総合学力テスト"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-750 mb-1">実施年度</label>
                <input
                  type="text"
                  required
                  placeholder="例：2025年度"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Drag and drop element */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-indigo-600 bg-indigo-50/20' : 'border-gray-200 hover:border-indigo-450 hover:bg-gray-50/20'
                }`}
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <input
                  type="file"
                  id="file-upload-input"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCsvFile(e.target.files[0]);
                    }
                  }}
                />
                <FileText className={`h-12 w-12 mx-auto mb-2 transition-transform ${dragActive ? 'scale-110 text-indigo-600' : 'text-gray-300'}`} />
                <span className="text-xs font-bold text-gray-700 block">
                  {csvFile ? csvFile.name : 'CSVファイルをドラッグ＆ドロップ'}
                </span>
                <span className="text-[10px] text-gray-400 block mt-1">または、ここをクリックしてパソコンから選択</span>
              </div>

              {csvFile && (
                <button
                  onClick={handleImportCSV}
                  disabled={importing}
                  id="import-csv-trigger"
                  className="w-full text-center flex justify-center items-center space-x-2 py-2.5 px-4 bg-indigo-650 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-extrabold text-xs rounded-lg transition shadow-sm"
                >
                  {importing ? (
                    <span>解析インポート中...</span>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>成績インポート実行</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="lg:col-span-2 space-y-4">
              {/* Benesse Specifications Note */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 text-xs text-amber-805 space-y-1.5 leading-relaxed">
                <span className="font-extrabold flex items-center text-amber-900 text-sm mb-1">
                  <AlertCircle className="h-4 w-4 mr-1 shrink-0" />
                  ベネッセ模試一括取り込みフォーマット仕様
                </span>
                <p>1. 1行目（ファイルタイトル等）は自動で無視・スキップし、<b>2行目をヘッダー項目行</b>として読み込みます。</p>
                <p>2. 解析の際、ヘッダーに「<b>組</b>」「<b>番号</b>」「<b>国語計</b>」「<b>数学計</b>」「<b>英語計</b>」が含まれている必要があります。</p>
                <p>3. 組（例: 05）、番号（例: 0030）をキーに生徒ユーザーデータから class と attendance_number が完全一致する生徒情報を引き当て、成績を追加します。</p>
              </div>

              {/* Match Logs Console output */}
              {importLogs.length > 0 && (
                <div className="bg-gray-900 rounded-xl p-5 font-mono text-[10px] text-gray-300 select-text">
                  <span className="font-extrabold text-[11px] text-indigo-400 block border-b border-gray-800 pb-1 mb-2">💻 解析処理照合コンソール</span>
                  <div className="max-h-[200px] overflow-y-auto space-y-1.5 scrollbar-thin">
                    {importLogs.map((log, index) => (
                      <p key={index} className="leading-relaxed">{log}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- SUB-COMP MODAL: INTEGRATED STUDENT PILOT/KARTE & FEEDBACKS ----------------- */}
      {selectedStudentForLog && (
        <div className="fixed inset-0 bg-gray-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center bg-indigo-900 text-white px-6 py-4">
              <div className="flex items-center space-x-3">
                <span className="bg-indigo-800 text-indigo-200 font-extrabold px-2.5 py-1 rounded-xl text-xs border border-indigo-700">
                  {selectedStudentForLog.class}組 - {parseInt(selectedStudentForLog.attendance_number || '0')}番
                </span>
                <div>
                  <h3 className="text-base font-black tracking-tight leading-normal">
                    {selectedStudentForLog.name} の学習指導カルテ
                  </h3>
                  <span className="text-[10px] text-indigo-200 font-mono tracking-wider">{selectedStudentForLog.kana_name} / {selectedStudentForLog.email}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedStudentForLog(null);
                  setCommentInputMap({});
                }}
                className="text-indigo-200 hover:text-white p-1 rounded-lg hover:bg-indigo-850 transition-all border border-transparent hover:border-indigo-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Scrollable Workspace */}
            <div className="p-6 overflow-y-auto space-y-6 bg-slate-50/30 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* PORTFOLIO COLOUMN A: DEV HISTORY ANALYSIS */}
              <div className="space-y-6">
                
                {/* Profile targets card */}
                <div className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold text-gray-400 block uppercase tracking-wider">第一志望校</span>
                    <span className="text-sm font-black text-gray-800">{selectedStudentForLog.target_school || '未設定'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-gray-400 block uppercase tracking-wider">目標偏差値</span>
                    <span className="text-sm font-black text-indigo-700 font-mono">
                      {selectedStudentForLog.target_deviation ? `偏差値 ${selectedStudentForLog.target_deviation}` : '未設定'}
                    </span>
                  </div>
                </div>

                {/* Recharts Graphical Trends */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm space-y-3">
                  <h4 className="text-xs font-extrabold text-gray-800 tracking-wider flex items-center space-x-1.5">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    <span>最新模試 偏差値推移グラフ</span>
                  </h4>

                  {allResults.filter((r) => r.uid === selectedStudentForLog.uid).length === 0 ? (
                    <div className="text-center py-12 text-gray-300 text-xs">
                      模試データが登録されていません。
                    </div>
                  ) : (
                    <div className="h-48 text-xs font-mono">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={allResults
                            .filter((r) => r.uid === selectedStudentForLog.uid)
                            .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
                            .map((r) => ({
                              name: r.exam_name.replace('総合学力テスト', '').substring(0, 10),
                              '平均': r.subject_deviations.average || 0,
                              '英語': r.subject_deviations.english || 0,
                              '数学': r.subject_deviations.math || 0,
                              '国語': r.subject_deviations.japanese || 0,
                            }))}
                          margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} />
                          <YAxis domain={[30, 80]} stroke="#94a3b8" fontSize={9} />
                          <Tooltip />
                          <Legend iconSize={8} />
                          <Line type="monotone" dataKey="平均" stroke="#4f46e5" strokeWidth={2.5} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="英語" stroke="#10b981" strokeWidth={1} />
                          <Line type="monotone" dataKey="数学" stroke="#3b82f6" strokeWidth={1} />
                          <Line type="monotone" dataKey="国語" stroke="#ef4444" strokeWidth={1} />
                          {selectedStudentForLog.target_deviation && (
                            <ReferenceLine y={selectedStudentForLog.target_deviation} stroke="#ec4899" strokeDasharray="3 3" label={{ value: '目標', position: 'right', fill: '#ec4899', fontSize: 9 }} />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Score listing list */}
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                  <h4 className="text-xs font-extrabold text-gray-800 tracking-wider mb-2">模試成績一覧</h4>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {allResults
                      .filter((r) => r.uid === selectedStudentForLog.uid)
                      .map((res) => (
                        <div key={res.id} className="p-2.5 bg-gray-50 rounded-lg text-xs flex justify-between items-center border border-gray-100">
                          <div>
                            <span className="font-extrabold text-gray-800 block text-[11px]">{res.exam_name}</span>
                            <span className="text-[10px] text-gray-400 font-mono block mt-0.5">{res.exam_date}</span>
                          </div>
                          <div className="flex gap-1.5 font-bold font-mono">
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">平均: {res.subject_deviations.average}</span>
                            <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[10px]">英: {res.subject_deviations.english || '—'}</span>
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">数: {res.subject_deviations.math || '—'}</span>
                          </div>
                        </div>
                      ))}
                    {allResults.filter((r) => r.uid === selectedStudentForLog.uid).length === 0 && (
                      <p className="text-xs text-center text-gray-400 py-4">登録された成績はありません。</p>
                    )}
                  </div>
                </div>
              </div>

              {/* PORTFOLIO COLOUMN B: STUDY LOGS FEED & REAL-TIME FEEDBACK FORM */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-widest flex items-center space-x-1.5">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  <span>日常学習記録 ＆ 指導アドバイスフィード</span>
                </h4>

                <div className="space-y-4 scrollbar-thin max-h-[500px] overflow-y-auto pr-1">
                  {allLogs.filter((log) => log.uid === selectedStudentForLog.uid).length === 0 ? (
                    <div className="text-center py-20 bg-white border border-gray-100 rounded-xl text-gray-400">
                      <BookOpen className="h-8 w-8 mx-auto text-gray-200 mb-2" />
                      <p className="text-xs">生徒はまだ日常学習を記録していません。</p>
                    </div>
                  ) : (
                    allLogs
                      .filter((log) => log.uid === selectedStudentForLog.uid)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((log) => {
                        // Resolve linked workbook page progression if is registered
                        const workbookRefObj = log.workbookId ? workbooks.find(w => w.id === log.workbookId) : null;
                        const hasPages = log.pagesFrom !== undefined && log.pagesTo !== undefined;
                        let progressPercent = 0;
                        if (hasPages && workbookRefObj?.totalPages) {
                          progressPercent = Math.min(100, Math.round((log.pagesTo! / workbookRefObj.totalPages) * 100));
                        }

                        return (
                          <div key={log.id} className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm relative space-y-3">
                            
                            {/* Log header badges */}
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <div className="flex items-center space-x-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                                  {log.subject}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono flex items-center">
                                  <Calendar className="h-3 w-3 mr-0.5" />
                                  {log.date}
                                </span>
                              </div>
                              
                              <div className="flex items-center space-x-1 text-xs text-gray-800 font-extrabold font-mono">
                                <Clock className="h-3.5 w-3.5 text-indigo-500" />
                                <span>{log.duration}分</span>
                              </div>
                            </div>

                            {/* Log text description */}
                            <div>
                              <p className="text-xs font-semibold text-gray-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-normal">
                                {log.content}
                              </p>
                            </div>

                            {/* Workbook Progression Widget if linked */}
                            {log.workbookId && (
                              <div className="bg-indigo-50/30 border border-indigo-150 rounded-lg p-2.5 text-xs text-indigo-900 space-y-1">
                                <div className="flex justify-between items-center font-bold">
                                  <span className="flex items-center">
                                    <Sparkles className="h-3.5 w-3.5 text-indigo-600 mr-1" />
                                    問題集: {log.workbookTitle || 'おすすめ教材'}
                                  </span>
                                  {hasPages && (
                                    <span className="font-mono text-[10px]">p.{log.pagesFrom} 〜 p.{log.pagesTo}</span>
                                  )}
                                </div>
                                {hasPages && workbookRefObj?.totalPages && (
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[9px] text-indigo-700 font-bold font-mono">
                                      <span>到達度: {Math.max(0, log.pagesTo || 0)} / {workbookRefObj.totalPages} ページ</span>
                                      <span>{progressPercent}%</span>
                                    </div>
                                    <div className="w-full bg-indigo-100/60 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Existing reactions list */}
                            {log.reaction && (
                              <div className="flex items-center space-x-1">
                                <span className="text-[11px] font-bold text-gray-400">教員のリアクション:</span>
                                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-yellow-100 text-xs shadow-inner">
                                  {log.reaction}
                                </span>
                              </div>
                            )}

                            {/* Reactions Triggering bar */}
                            <div className="flex items-center space-x-1.5 bg-gray-50/50 p-1.5 rounded-lg border border-gray-100">
                              <span className="text-[10px] text-gray-450 font-bold mr-1">いいね:</span>
                              {['💯', '🔥', '👏', '👍', '⭐'].map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleAddReaction(log.id!, emoji)}
                                  className={`hover:scale-125 transition-transform text-xs p-1 rounded hover:bg-white border ${
                                    log.reaction === emoji ? 'bg-yellow-100 border-yellow-300 scale-110 shadow-sm' : 'border-transparent'
                                  }`}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>

                            {/* Existing comments bubble list */}
                            {log.comments && log.comments.length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                                <span className="text-[10px] text-gray-400 font-bold block">過去の指導・コメント:</span>
                                {log.comments.map((comment) => (
                                  <div key={comment.id} className="p-2 bg-indigo-50/40 rounded-lg text-[11px] text-indigo-900 border border-indigo-100 space-y-1">
                                    <div className="flex justify-between items-center font-bold text-[9px] text-indigo-750">
                                      <span>{comment.teacherName}</span>
                                      <span>{new Date(comment.createdAt).toLocaleString()}</span>
                                    </div>
                                    <p className="leading-normal">{comment.comment}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Inline text instructions submission form */}
                            <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center space-x-2">
                              <input
                                type="text"
                                placeholder="アドバイスや激励コメントを入力..."
                                value={commentInputMap[log.id!] || ''}
                                onChange={(e) => setCommentInputMap(prev => ({ ...prev, [log.id!]: e.target.value }))}
                                className="flex-1 bg-gray-50 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                              />
                              <button
                                onClick={() => handleAddComment(log.id!)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold leading-none flex items-center space-x-1 text-center font-sans tracking-tight"
                              >
                                <span>送信</span>
                              </button>
                            </div>

                          </div>
                        );
                      })
                  )}
                </div>
              </div>

            </div>

            {/* Modal actions */}
            <div className="bg-slate-50 px-6 py-3 border-t border-gray-200 text-right">
              <button
                onClick={() => {
                  setSelectedStudentForLog(null);
                  setCommentInputMap({});
                }}
                className="py-1 px-4 text-xs font-bold text-gray-700 border border-gray-300 hover:bg-gray-100 rounded-lg transition"
              >
                閉じる
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Student Edit Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center bg-indigo-50/50 px-6 py-4 border-b border-indigo-100/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                <Edit3 className="h-4 w-4 text-indigo-600" />
                <span>生徒情報の編集</span>
              </h3>
              <button 
                onClick={() => setEditingStudent(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStudent} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">漢字氏名</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="例: 吉田 拓人"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">フリガナ（カタカナ氏名）</label>
                <input
                  type="text"
                  required
                  value={editKanaName}
                  onChange={(e) => setEditKanaName(e.target.value)}
                  onBlur={() => setEditKanaName(normalizeToHalfWidthKana(editKanaName))}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="例: ﾖｼﾀﾞ ﾋﾛﾄ"
                />
                <p className="mt-1 text-[10px] text-gray-500">※ひらがなや全角カナで入力しても、自動で半角カナに変換されます。</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">学年</label>
                  <select
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                    className="block w-full px-2 py-2 border border-gray-200 bg-white rounded-lg text-[11px] focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="高校１年生">高校１年</option>
                    <option value="高校２年生">高校２年</option>
                    <option value="高校３年生">高校３年</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">組 (2桁)</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value)}
                    onBlur={() => setEditClass(padLeftWithZeros(editClass, 2))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="05"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">出席番号 (4桁)</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={editAttendance}
                    onChange={(e) => setEditAttendance(e.target.value)}
                    onBlur={() => setEditAttendance(padLeftWithZeros(editAttendance, 4))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="0032"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-1.5 px-4 rounded-lg border border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition"
                >
                  変更を保存
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Workbook Edit Modal */}
      {editingWorkbook && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center bg-indigo-50/50 px-5 py-3.5 border-b border-indigo-100/50">
              <h3 className="text-xs font-bold text-gray-950 flex items-center space-x-2">
                <Edit3 className="h-4 w-4 text-indigo-600" />
                <span>おすすめ問題集の編集</span>
              </h3>
              <button 
                onClick={() => setEditingWorkbook(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateWorkbook} className="p-5 space-y-3.5 text-left">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">問題集の名称</label>
                <input
                  type="text"
                  required
                  value={editWbTitle}
                  onChange={(e) => setEditWbTitle(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="例：青チャート 数学I+A"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">対象教科</label>
                  <select
                    value={editWbSubject}
                    onChange={(e) => setEditWbSubject(e.target.value)}
                    className="block w-full px-2 py-2 border border-gray-200 bg-white rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="英語">英語</option>
                    <option value="数学">数学</option>
                    <option value="国語">国語</option>
                    <option value="理科">理科</option>
                    <option value="社会">社会</option>
                    <option value="情報">情報</option>
                    <option value="その他">その他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">総ページ数 (任意)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="例: 240"
                    value={editWbTotalPages}
                    onChange={(e) => setEditWbTotalPages(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">推奨偏差値 (下限)</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="80"
                    value={editWbMinDev}
                    onChange={(e) => setEditWbMinDev(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">推奨偏差値 (上限)</label>
                  <input
                    type="number"
                    required
                    min="30"
                    max="85"
                    value={editWbMaxDev}
                    onChange={(e) => setEditWbMaxDev(e.target.value === '' ? '' : Number(e.target.value))}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  教材の取り組み方・アドバイス (取説)
                </label>
                <textarea
                  placeholder="例：基本例題を1時間で3問ペースで解き、間違えた問題は当日夜に再度記述すること。"
                  value={editWbInstructions}
                  onChange={(e) => setEditWbInstructions(e.target.value)}
                  rows={4}
                  className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none leading-normal"
                />
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setEditingWorkbook(null)}
                  className="flex-1 py-1.5 px-4 rounded-lg border border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition animate-none"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition animate-none"
                >
                  変更を保存
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
          >
            <div className="flex justify-between items-center bg-red-50/50 px-6 py-4 border-b border-red-100/50">
              <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                <Trash2 className="h-4 w-4 text-red-600" />
                <span>{deleteConfirmation.title}</span>
              </h3>
              <button 
                onClick={() => setDeleteConfirmation((prev) => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                {deleteConfirmation.message}
              </p>

              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 flex items-start space-x-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed font-semibold">
                  ※この削除操作は元に戻せません。本当に実行してもよろしいですか？
                </p>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-150">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmation((prev) => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-1.5 px-4 rounded-lg border border-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition"
                >
                  キャンセル
                </button>
                <button
                  onClick={executeDelete}
                  className="flex-1 py-1.5 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs shadow-sm transition"
                >
                  本当に削除する
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global In-App Safe Toast Notification */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 z-50">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center space-x-3 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              notification.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : notification.type === 'error'
                  ? 'bg-red-50 border-red-100 text-red-800'
                  : 'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-indigo-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </motion.div>
        </div>
      )}
    </div>
  );
}
