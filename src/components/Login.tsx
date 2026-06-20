import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { UserRole, User } from '../types';
import { motion } from 'motion/react';
import { GraduationCap, Mail, Lock, User as UserIcon, HelpCircle, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { normalizeToHalfWidthKana, padLeftWithZeros } from '../utils/kanaUtils';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  externalError?: string | null;
  onClearExternalError?: () => void;
}

export default function Login({ onLoginSuccess, externalError, onClearExternalError }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration additional fields
  const [name, setName] = useState('');
  const [kanaName, setKanaName] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [grade, setGrade] = useState('高校３年生');
  const [classNum, setClassNum] = useState(''); // 2桁 (e.g. "05")
  const [attendanceNum, setAttendanceNum] = useState(''); // 4桁 (e.g. "0030")
  const [teacherCode, setTeacherCode] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Sync externalError into local state
  React.useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  // Helper to pad strings
  const handleClassNumBlur = () => {
    if (classNum) {
      setClassNum(padLeftWithZeros(classNum, 2));
    }
  };

  const handleAttendanceNumBlur = () => {
    if (attendanceNum) {
      setAttendanceNum(padLeftWithZeros(attendanceNum, 4));
    }
  };

  const handleKanaNameBlur = () => {
    if (kanaName) {
      setKanaName(normalizeToHalfWidthKana(kanaName));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (onClearExternalError) {
      onClearExternalError();
    }
    setLoading(true);

    try {
      if (isSignUp) {
        // Validation checks
        if (!name.trim()) throw new Error('漢字氏名を入力してください。');
        if (!kanaName.trim()) throw new Error('フリガナ（カタカナ氏名）を入力してください。');
        
        // Auto-normalize Katakana and remove any input discrepancies (converts full-width, hiragana, etc.)
        const normalizedKana = normalizeToHalfWidthKana(kanaName);
        if (!normalizedKana) {
          throw new Error('有効なカタカナフリガナの入力が必要です。');
        }

        let finalClassNum = classNum;
        let finalAttendanceNum = attendanceNum;

        if (role === 'student') {
          if (!classNum) throw new Error('組を入力してください。');
          finalClassNum = padLeftWithZeros(classNum, 2);
          if (finalClassNum.length !== 2) {
            throw new Error('組は2桁の数値で入力してください（例: 05）。');
          }

          if (!attendanceNum) throw new Error('番号（出席番号）を入力してください。');
          finalAttendanceNum = padLeftWithZeros(attendanceNum, 4);
          if (finalAttendanceNum.length !== 4) {
            throw new Error('出席番号は4桁の数値で入力してください（例: 0032）。');
          }
        } else if (role === 'teacher') {
          if (!teacherCode) {
            throw new Error('教員用セキュリティコードを入力してください。');
          }
          const expectedCode = import.meta.env.VITE_TEACHER_SIGNUP_CODE || 'm1t0k1ry0';
          if (teacherCode !== expectedCode) {
            throw new Error('入力された教員用セキュリティコード（合言葉）が正しくありません。正しい検証用コードを管理者の先生にお問い合わせください。');
          }
        }

        // 1. Auth SignUp
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const registeredUser = userCredential.user;

        // 2. Database User Payload
        const userPayload: User = {
          uid: registeredUser.uid,
          email: email.trim(),
          name: name.trim(),
          kana_name: normalizedKana,
          role,
          ...(role === 'student' ? {
            grade,
            class: finalClassNum,
            attendance_number: finalAttendanceNum,
            target_school: '',
            target_deviation: 60
          } : {})
        };

        // 3. Save User Profile to Firestore
        try {
          await setDoc(doc(db, 'users', registeredUser.uid), userPayload);
        } catch (firestoreErr) {
          handleFirestoreError(firestoreErr, OperationType.CREATE, `users/${registeredUser.uid}`);
        }

        onLoginSuccess(userPayload);
      } else {
        // Auth Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // User profile will be fetched in AppComponent on auth change
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '認証エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4" id="login-container">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[440px] bg-white rounded-[24px] card-shadow border border-slate-200/60 overflow-hidden"
      >
        <div className="p-8 pb-6 border-b border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="bg-slate-900 p-4 rounded-[16px] shadow-sm mb-5">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-[22px] display-heading font-bold">
            {isSignUp ? 'アカウント作成' : 'サインイン'}
          </h2>
          <p className="mt-2.5 text-slate-500 text-[13px] leading-relaxed max-w-[280px]">
            {isSignUp 
              ? '模試成績と日常学習を効果的に可視化・管理しましょう。' 
              : '水戸葵陵高校Score & Studyへようこそ。資格情報でサインインしてください。'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6" id="login-form">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700 flex items-start space-x-2">
              <span className="font-semibold">エラー:</span>
              <span>{error}</span>
            </div>
          )}

          {/* Email / Password */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                メールアドレス
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                パスワード
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Lock className="h-5 w-5" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="6文字以上のパスワード"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-gray-900 bg-gray-50/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Sign Up Fields */}
          {isSignUp && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className="space-y-4 pt-4 border-t border-gray-100"
            >
              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  アカウント種別
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`p-4 rounded-[12px] border flex flex-col items-center justify-center space-y-2 transition-all ${
                      role === 'student'
                        ? 'border-slate-900 bg-slate-900 text-white font-medium shadow-md'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <UserIcon className="h-5 w-5" />
                    <span className="text-sm">生徒</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('teacher')}
                    className={`p-4 rounded-[12px] border flex flex-col items-center justify-center space-y-2 transition-all ${
                      role === 'teacher'
                        ? 'border-slate-900 bg-slate-900 text-white font-medium shadow-md'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-sm">教員</span>
                  </button>
                </div>
              </div>

              {/* Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    漢字氏名
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="水戸 太郎"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-slate-900 bg-slate-50/50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    フリガナ（カタカナ氏名）
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ミト タロウ"
                    value={kanaName}
                    onChange={(e) => setKanaName(e.target.value)}
                    onBlur={handleKanaNameBlur}
                    className="block w-full px-3 py-2.5 border border-slate-200 rounded-[10px] text-slate-900 bg-slate-50/50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white font-mono transition-all text-sm"
                  />
                  <p className="mt-1 text-[10px] text-gray-500 leading-relaxed">
                    ※全角・ひらがな（例：みと たろう）で入力しても、自動で半角カナに変換されます。
                  </p>
                </div>
              </div>

              {/* Student Only Fields */}
              {role === 'student' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 bg-slate-50 p-5 rounded-[16px] border border-slate-200/60"
                >
                  <h4 className="text-xs font-bold text-gray-700 mb-1">生徒所属情報（模試CSV紐付けに必須）</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        学年
                      </label>
                      <select
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="block w-full px-2.5 py-2.5 border border-slate-200 rounded-[8px] text-slate-800 bg-white text-[13px] focus:ring-2 focus:ring-slate-900 focus:outline-none transition-shadow"
                      >
                        <option value="高校１年生">高校１年生</option>
                        <option value="高校２年生">高校２年生</option>
                        <option value="高校３年生">高校３年生</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        組 (2桁 / 例: 05)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="05"
                        value={classNum}
                        onChange={(e) => setClassNum(e.target.value)}
                        onBlur={handleClassNumBlur}
                        maxLength={2}
                        className="block w-full px-2.5 py-2 border border-gray-200 rounded-lg text-gray-800 bg-white text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        出席番号 (4桁 / 例: 0030)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="0030"
                        value={attendanceNum}
                        onChange={(e) => setAttendanceNum(e.target.value)}
                        onBlur={handleAttendanceNumBlur}
                        maxLength={4}
                        className="block w-full px-2.5 py-2 border border-gray-200 rounded-lg text-gray-800 bg-white text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Teacher Only Security Field */}
              {role === 'teacher' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 bg-amber-50/70 p-4 rounded-xl border border-amber-200"
                >
                  <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    教員認証確認
                  </h4>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-950 mb-1">
                      教員用セキュリティコード（合言葉）
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="暗証コードを入力してください"
                      value={teacherCode}
                      onChange={(e) => setTeacherCode(e.target.value)}
                      className="block w-full px-3 py-2 border border-amber-200 rounded-lg text-gray-800 bg-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder-gray-400"
                    />
                    <p className="mt-1 text-[10px] text-amber-700 leading-relaxed">
                      ※生徒の誤登録を防ぐための学校共通の暗証コードです。わからない場合は、管理者または同僚の先生に確認してください。默认值は「kiryo-teacher-2026」です。
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Submit Action */}
          <button
            type="submit"
            disabled={loading}
            id="auth-submit-button"
            className="w-full h-11 flex justify-center items-center space-x-2 rounded-xl text-[14px] font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>処理中...</span>
              </span>
            ) : (
              <span>{isSignUp ? 'アカウントを作成' : 'サインイン'}</span>
            )}
          </button>

          {/* Toggle Join / Login */}
          <div className="text-center pt-2">
            <button
              type="button"
              id="switch-auth-mode"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-[13px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              {isSignUp ? 'すでにアカウントをお持ちですか？ サインイン' : '新しくアカウントを作りますか？ 登録へ'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
