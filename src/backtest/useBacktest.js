import { useState, useCallback } from 'react';
import { runFullBacktest } from './runFullBacktest.js';

export function useBacktest() {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const full = await runFullBacktest((done, total) => setProgress({ done, total }));
      const { historyByTicker: _historyByTicker, ...rest } = full;
      setResult(rest);
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, []);

  return { status, progress, result, error, run };
}
