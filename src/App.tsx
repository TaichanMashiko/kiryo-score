import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { User } from './types';
import Navbar from './components/Navbar';
import Login from './components/Login';
import StudentDashboard from './components/StudentDashboard';
import TeacherDashboard from './components/TeacherDashboard';
import { GraduationCap } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [authError, setAuthError] = useState<string | null>(null);

  // Client Side Router Helper
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Sync back button / popstate
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen to Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setLoadingAuth(true);
      if (fbUser) {
        try {
          // Fetch user profile from firestore
          const docRef = doc(db, 'users', fbUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCurrentUser({
              uid: fbUser.uid,
              ...data
            } as User);
            setAuthError(null);
          } else {
            // Profile doc doesn't exist yet (might be custom, manually created in console, or incomplete)
            console.warn("User profile not found in Firestore for UID:", fbUser.uid);
            setAuthError("メールアドレスは登録されていますが、プロフィール情報（氏名やクラスなど）が見つかりません。アカウントの新規登録（サインアップ）からアカウントを作成してください。");
            await signOut(auth);
            setCurrentUser(null);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setAuthError("プロフィール情報の取得中にエラーが発生しました。インターネット接続とFirebaseの設定をお確かめください。");
          await signOut(auth);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoadingAuth(false);
    });

    return unsubscribe;
  }, []);

  // Navigation and Redirect Guards (Role-based Guards)
  useEffect(() => {
    if (loadingAuth) return;

    if (!currentUser) {
      // Unauthenticated users MUST be redirected to /login only
      if (currentPath !== '/login') {
        navigate('/login');
      }
    } else {
      // Authenticated guard logic based on roles
      if (currentUser.role === 'teacher') {
        if (currentPath !== '/teacher/dashboard') {
          navigate('/teacher/dashboard');
        }
      } else if (currentUser.role === 'student') {
        if (currentPath !== '/student/dashboard') {
          navigate('/student/dashboard');
        }
      }
    }
  }, [currentUser, currentPath, loadingAuth]);

  // Handle successful login/register manually if profile not immediate on auth state change
  const handleLoginSuccess = (userPayload: User) => {
    setCurrentUser(userPayload);
    if (userPayload.role === 'teacher') {
      navigate('/teacher/dashboard');
    } else {
      navigate('/student/dashboard');
    }
  };

  // Rendering loading spinner on boot
  if (loadingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 flex-col space-y-5" id="global-loader">
        <div className="bg-slate-900 text-white p-5 rounded-[20px] animate-pulse shadow-sm">
          <GraduationCap className="h-8 w-8" />
        </div>
        <div className="flex flex-col items-center">
          <h2 className="text-[15px] display-heading font-bold text-slate-800 tracking-wider">水戸葵陵 Score & Study</h2>
          <p className="text-[11px] text-slate-400 font-mono mt-1.5">システムの接続確認および認証情報のロード中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col justify-between selection:bg-slate-900 selection:text-white" id="app-viewport">
      <div className="flex-1 flex flex-col">
        {/* Navbar is only rendered if authenticated */}
        <Navbar user={currentUser} onNavigate={navigate} currentPath={currentPath} />

        <main className="flex-1">
          {!currentUser ? (
            <Login 
              onLoginSuccess={handleLoginSuccess} 
              externalError={authError} 
              onClearExternalError={() => setAuthError(null)} 
            />
          ) : currentUser.role === 'teacher' ? (
            <TeacherDashboard />
          ) : (
            <StudentDashboard user={currentUser} onUserUpdate={(updated) => setCurrentUser(updated)} />
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/60 py-5 text-center text-[10px] text-slate-400 font-mono tracking-wide">
        &copy; 2026 水戸葵陵高校 模試成績・学習総合管理システム. All rights reserved.
      </footer>
    </div>
  );
}
