import React from 'react';
import { Bug, Lock, RefreshCw } from 'lucide-react';
import { PROJECTS, type ProjectId } from '../projects';
import { PROJECT_PASSWORDS } from '../types/bug';

// Simple arithmetic captcha: two small numbers the tester must add up.
function makeCaptcha() {
  return { a: Math.floor(Math.random() * 9) + 1, b: Math.floor(Math.random() * 9) + 1 };
}

export function LoginScreen({ onLogin }: { onLogin: (projectId: ProjectId, name: string) => void }) {
  const [projectId, setProjectId] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [captcha, setCaptcha] = React.useState(makeCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  function refreshCaptcha() {
    setCaptcha(makeCaptcha());
    setCaptchaAnswer('');
  }

  function submit() {
    if (!projectId) {
      setError('Please select your project.');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (password !== PROJECT_PASSWORDS[projectId as ProjectId]) {
      setError('Incorrect password for this project. Please try again.');
      return;
    }
    if (captchaAnswer.trim() === '' || Number(captchaAnswer) !== captcha.a + captcha.b) {
      setError('Incorrect captcha answer. Please try again.');
      refreshCaptcha();
      return;
    }
    setError(null);
    onLogin(projectId as ProjectId, name.trim());
  }

  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <div className="brand login-brand">
          <div className="logo">
            <Bug size={23} />
          </div>
          <span>XIIA::BugTracker</span>
        </div>
        <h1>Tester Login</h1>
        <p>Select your project and enter the tester password to continue.</p>
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setError(null);
            }}
          >
            <option value="">Select project</option>
            {Object.entries(PROJECTS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your Name
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Jane Tester"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Enter tester password"
          />
        </label>
        <label>
          Captcha
          <div className="captcha-row">
            <span className="captcha-q">
              {captcha.a} + {captcha.b} = ?
            </span>
            <button type="button" className="captcha-refresh" onClick={refreshCaptcha} aria-label="New captcha">
              <RefreshCw size={15} />
            </button>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={captchaAnswer}
            onChange={(e) => {
              setCaptchaAnswer(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Enter the answer"
          />
        </label>
        {error && <div className="form-msg err">{error}</div>}
        <button type="button" className="primary login-btn" onClick={submit}>
          <Lock size={16} /> Login
        </button>
      </div>
    </div>
  );
}
