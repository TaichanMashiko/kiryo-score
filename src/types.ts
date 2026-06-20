export type UserRole = 'student' | 'teacher';

export interface User {
  uid: string;
  email: string;
  name: string; // 漢字氏名
  kana_name: string; // 半角カタカナ氏名 (例: ﾔﾏｸﾞﾁ ﾕｳｶ)
  role: UserRole;
  grade?: string; // 生徒のみ。例: "高校３年生"
  class?: string; // 生徒のみ。2桁文字列。例: "05"
  attendance_number?: string; // 生徒のみ。4桁文字列。例: "0030"
  target_school?: string; // 生徒のみ
  target_deviation?: number; // 生徒のみ
  registered_workbooks?: string[]; // 生徒のみ。登録済おすすめ問題集ID
}

export interface SubjectDeviations {
  english?: number;
  math?: number;
  japanese?: number;
  social?: number;
  science?: number;
  information?: number;
  average?: number; // 国数英3教科の平均、または全体の平均
}

export interface MockResult {
  id?: string;
  uid: string;
  exam_name: string; // 模試名
  exam_date: string; // 実施年度または日付 (例: "2025年度")
  subject_deviations: SubjectDeviations;
}

export type StudySubject = '英語' | '数学' | '国語' | '理科' | '社会' | 'その他';

export interface StudyLogComment {
  id: string;
  teacherId: string;
  teacherName: string;
  comment: string;
  createdAt: string;
}

export interface StudyLog {
  id?: string;
  uid: string;
  date: string; // YYYY-MM-DD
  duration: number; // 分
  subject: StudySubject;
  content: string;
  workbookId?: string; // Linked workbook id
  workbookTitle?: string; // Optional snapshot for simple listing
  pagesFrom?: number;
  pagesTo?: number;
  comments?: StudyLogComment[];
  reaction?: string; // e.g. '👍', '🔥', '👏', '⭐', '💯'
}

export interface Workbook {
  id?: string;
  title: string;
  subject: string;
  min_deviation: number;
  max_deviation: number;
  totalPages?: number; // Total pages for study tracking
  instructions?: string; // Instructions or "取説" for studying the workbook
  createdBy?: string; // UID of the user who created it (student or teacher)
  coverImageBase64?: string; // Base64 encoded image
}
