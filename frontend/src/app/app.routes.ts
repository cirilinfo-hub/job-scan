import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guards';

const page = (title: string) => `${title} | Rolewise`;

export const routes: Routes = [
  {
    path: '',
    canActivate: [guestGuard],
    loadComponent: () => import('./layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      { path: 'login', title: page('Sign in'), loadComponent: () => import('./features/auth/auth-pages').then((m) => m.LoginPage) },
      { path: 'register', title: page('Create account'), loadComponent: () => import('./features/auth/auth-pages').then((m) => m.RegisterPage) },
      { path: 'forgot-password', title: page('Forgot password'), loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ForgotPage) },
      { path: 'reset-password', title: page('Reset password'), loadComponent: () => import('./features/auth/auth-pages').then((m) => m.ResetPage) },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },
  { path: 'verify-email', title: page('Verify email'), loadComponent: () => import('./features/auth/verify-page').then((m) => m.VerifyPage) },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      { path: 'dashboard', title: page('Dashboard'), loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage) },
      { path: 'resumes', title: page('Resumes'), loadComponent: () => import('./features/resume-manager/resume-list-page').then((m) => m.ResumeListPage) },
      { path: 'resumes/:id', title: page('Resume'), loadComponent: () => import('./features/resume-manager/resume-detail-page').then((m) => m.ResumeDetailPage) },
      { path: 'scanner', title: page('Resume scanner'), loadComponent: () => import('./features/resume-scanner/scanner-page').then((m) => m.ScannerPage) },
      { path: 'scanner/:id', title: page('Match report'), loadComponent: () => import('./features/resume-scanner/report-page').then((m) => m.ReportPage) },
      { path: 'optimizer', title: page('Resume optimizer'), loadComponent: () => import('./features/resume-optimizer/optimizer-page').then((m) => m.OptimizerPage) },
      { path: 'builder', title: page('Resume builder'), loadComponent: () => import('./features/resume-builder/builder-page').then((m) => m.BuilderPage) },
      { path: 'jobs', title: page('Job search'), loadComponent: () => import('./features/job-search/job-search-page').then((m) => m.JobSearchPage) },
      { path: 'jobs/:id', title: page('Job'), loadComponent: () => import('./features/job-search/job-detail-page').then((m) => m.JobDetailPage) },
      { path: 'matches', title: page('Best matches'), loadComponent: () => import('./features/job-matching/matches-page').then((m) => m.MatchesPage) },
      { path: 'tracker', title: page('Application tracker'), loadComponent: () => import('./features/job-tracker/tracker-page').then((m) => m.TrackerPage) },
      { path: 'cover-letters', title: page('Cover letters'), loadComponent: () => import('./features/cover-letter/letters-page').then((m) => m.LettersPage) },
      { path: 'cover-letters/:id', title: page('Cover letter'), loadComponent: () => import('./features/cover-letter/letter-detail-page').then((m) => m.LetterDetailPage) },
      { path: 'linkedin', title: page('LinkedIn optimizer'), loadComponent: () => import('./features/linkedin-optimizer/linkedin-page').then((m) => m.LinkedinPage) },
      { path: 'interviews', title: page('Interview prep'), loadComponent: () => import('./features/interview-preparation/interviews-page').then((m) => m.InterviewsPage) },
      { path: 'interviews/session/:id', title: page('Mock interview'), loadComponent: () => import('./features/interview-preparation/session-page').then((m) => m.SessionPage) },
      { path: 'notifications', title: page('Notifications'), loadComponent: () => import('./features/notifications/notifications-page').then((m) => m.NotificationsPage) },
      { path: 'profile', title: page('Profile and settings'), loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', title: page('Page not found'), loadComponent: () => import('./features/not-found').then((m) => m.NotFoundPage) },
];
