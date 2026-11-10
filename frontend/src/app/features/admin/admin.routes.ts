import { Routes } from '@angular/router';

const t = (s: string) => `${s} | Rolewise admin`;
const p = () => import('./admin-pages');

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', title: t('Metrics'), loadComponent: () => p().then((m) => m.AdminOverviewPage) },
  { path: 'users', title: t('Users'), loadComponent: () => p().then((m) => m.AdminUsersPage) },
  { path: 'roles', title: t('Roles'), loadComponent: () => p().then((m) => m.AdminRolesPage) },
  { path: 'plans', title: t('Plans and limits'), loadComponent: () => p().then((m) => m.AdminPlansPage) },
  { path: 'job-sources', title: t('Job sources'), loadComponent: () => p().then((m) => m.AdminSourcesPage) },
  { path: 'job-categories', title: t('Job categories'), loadComponent: () => p().then((m) => m.AdminCategoriesPage) },
  { path: 'skills', title: t('Skills'), loadComponent: () => p().then((m) => m.AdminSkillsPage) },
  { path: 'features', title: t('Features'), loadComponent: () => p().then((m) => m.AdminFeaturesPage) },
  { path: 'ai', title: t('AI provider'), loadComponent: () => p().then((m) => m.AdminAiPage) },
  { path: 'scoring', title: t('Scoring rules'), loadComponent: () => p().then((m) => m.AdminScoringPage) },
  { path: 'logs', title: t('System logs'), loadComponent: () => p().then((m) => m.AdminLogsPage) },
  { path: 'settings', title: t('Settings'), loadComponent: () => p().then((m) => m.AdminSettingsPage) },
];
