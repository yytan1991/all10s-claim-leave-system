import { Home, Briefcase, GraduationCap, BookOpen, Receipt, UserPlus, TrendingUp, ShieldCheck, Wallet } from 'lucide-react'

// The whole menu lives here. The sidebar shows one item per module; the pages of the current module
// appear as tabs along the top of each page; quick search can jump to any page the person may open.
//
// access: 'all'     any signed-in staff member (teachers included)
//         'manager' managers and admins
//         'admin'   admins only
// end: true means the page only matches its exact address (so '/leave' is not also '/leave/apply').
export const MODULES = [
  {
    key: 'home',
    label: 'Home',
    icon: Home,
    pages: [{ to: '/', label: 'Home', end: true }],
  },
  {
    key: 'work',
    label: 'My Work',
    icon: Briefcase,
    pages: [
      { to: '/announcements', label: 'Announcements' },
      { to: '/attendance', label: 'Attendance', end: true },
      { to: '/leave/apply', label: 'Apply Leave' },
      { to: '/leave', label: 'My Leave', end: true },
      { to: '/team-calendar', label: 'Team Calendar' },
      { to: '/claims/new', label: 'New Claim' },
      { to: '/claims', label: 'My Claims', end: true },
      { to: '/payslips', label: 'My Payslips', end: true },
    ],
  },
  {
    key: 'students',
    label: 'Students',
    icon: GraduationCap,
    pages: [
      { to: '/student-dashboard', label: 'Overview', end: true, access: 'admin' },
      { to: '/classes', label: 'Lessons', access: 'admin' },
      { to: '/students', label: 'Students', access: 'admin' },
      { to: '/teachers', label: 'Teachers', access: 'admin' },
      { to: '/student-attendance', label: 'Student Attendance' },
      { to: '/student-credits', label: 'Lesson Credits' },
    ],
  },
  {
    key: 'learning',
    label: 'Learning',
    icon: BookOpen,
    pages: [
      { to: '/learning-materials', label: 'Learning Materials' },
      { to: '/quizzes', label: 'Practice & Quizzes' },
      { to: '/student-progress', label: 'Student Progress' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: Receipt,
    pages: [
      { to: '/invoices', label: 'Invoice', access: 'admin' },
      { to: '/recurring-invoice', label: 'Recurring Invoice', access: 'admin' },
      { to: '/invoice-settings', label: 'Invoice Setting', access: 'admin' },
    ],
  },
  {
    key: 'admissions',
    label: 'Admissions',
    icon: UserPlus,
    pages: [
      { to: '/registration-approvals', label: 'Registration Approvals', access: 'admin' },
      { to: '/registration-form-builder', label: 'Form Builder', access: 'admin' },
      { to: '/parent-student-accounts', label: 'Parent/Student Accounts', access: 'admin' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: TrendingUp,
    pages: [
      { to: '/crm', label: 'Pipeline', end: true },
      { to: '/crm/board', label: 'Board' },
      { to: '/crm/leads', label: 'Leads' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    icon: ShieldCheck,
    pages: [
      { to: '/approvals', label: 'Approvals', access: 'manager' },
      { to: '/attendance-log', label: 'Attendance Log', access: 'manager' },
      { to: '/employees', label: 'Employees', access: 'admin' },
      { to: '/settings', label: 'Settings', access: 'admin' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: Wallet,
    pages: [
      { to: '/finance-dashboard', label: 'Overview', end: true, access: 'admin' },
      { to: '/cashflow', label: 'Cash Flow', access: 'admin' },
      { to: '/payslips-admin', label: 'Payslips', access: 'admin' },
    ],
  },
]

function canSee(access, { isManager, isAdmin }) {
  if (access === 'admin') return Boolean(isAdmin)
  if (access === 'manager') return Boolean(isManager || isAdmin)
  return true
}

// The modules (with only the pages this person may open). A module with no pages left is dropped.
// `to` is where clicking the module in the sidebar goes: its first page.
export function getModules(roles) {
  return MODULES.map((m) => ({ ...m, pages: m.pages.filter((p) => canSee(p.access || 'all', roles)) }))
    .filter((m) => m.pages.length > 0)
    .map((m) => ({ ...m, to: m.pages[0].to }))
}

export function pageMatches(page, pathname) {
  return page.end ? pathname === page.to : pathname === page.to || pathname.startsWith(`${page.to}/`)
}

// Which module and page the current address belongs to (the most specific match wins).
export function findActive(pathname, modules) {
  let best = null
  modules.forEach((module) => {
    module.pages.forEach((page) => {
      if (pageMatches(page, pathname) && (!best || page.to.length > best.page.to.length)) best = { module, page }
    })
  })
  return best
}

// Every page this person can open, for quick search.
export function flattenPages(modules) {
  return modules.flatMap((m) => m.pages.map((p) => ({ to: p.to, label: p.label, moduleLabel: m.label, moduleKey: m.key })))
}
