import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { User } from '../types';
import { LogOut, GraduationCap, Calendar, Clock, BookOpen, AlertCircle } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  onNavigate: (path: string) => void;
  currentPath: string;
}

export default function Navbar({ user, onNavigate, currentPath }: NavbarProps) {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onNavigate('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 shadow-sm" id="main-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo / Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => user ? onNavigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard') : onNavigate('/login')}>
            <div className="bg-slate-900 text-white p-2.5 rounded-[12px] flex items-center justify-center shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[18px] display-heading font-bold text-slate-900 tracking-tight block">水戸葵陵 Score & Study</span>
              <span className="text-[10px] text-slate-500 font-mono tracking-wide block font-semibold leading-none mt-0.5">模試・学習総合管理システム</span>
            </div>
          </div>

          {/* Right Section: User Status & Sign Out */}
          {user && (
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex flex-col text-right">
                <span className="text-[13px] font-semibold text-slate-900">
                  {user.name} {user.role === 'teacher' ? '先生' : 'さん'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {user.role === 'teacher' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[10px] font-semibold bg-slate-100 text-slate-700">教員アカウント</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
                      {user.grade || '生徒'} | {user.class}組 {parseInt(user.attendance_number || '0')}番
                    </span>
                  )}
                </span>
              </div>

              <button
                id="signout-button"
                onClick={handleSignOut}
                className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
