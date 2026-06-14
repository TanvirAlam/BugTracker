import React from 'react';
import { Dashboard } from './Dashboard';
import { LoginScreen } from './LoginScreen';
import { AUTH_STORAGE_KEY, TESTER_NAME_KEY, isProjectId } from '../types/bug';
import type { ProjectId } from '../projects';

export function Root() {
  const [projectId, setProjectId] = React.useState<ProjectId | null>(() => {
    const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(AUTH_STORAGE_KEY) : null;
    return isProjectId(stored) ? stored : null;
  });
  const [testerName, setTesterName] = React.useState<string>(() => {
    return (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TESTER_NAME_KEY) : null) || '';
  });

  const handleLogin = React.useCallback((id: ProjectId, name: string) => {
    sessionStorage.setItem(AUTH_STORAGE_KEY, id);
    sessionStorage.setItem(TESTER_NAME_KEY, name);
    setProjectId(id);
    setTesterName(name);
  }, []);

  const handleLogout = React.useCallback(() => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(TESTER_NAME_KEY);
    setProjectId(null);
    setTesterName('');
  }, []);

  if (!projectId) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard projectId={projectId} testerName={testerName} onLogout={handleLogout} />;
}
