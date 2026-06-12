import { useCallback, useState } from 'react';
import type { AgentConfig, AgentProvider } from '../types/dsl';
import { loadAgentConfig, saveAgentConfig } from '../storage';

export function useAgentConfig() {
  const [config, setConfig] = useState<AgentConfig>(() => loadAgentConfig());

  const setProvider = useCallback((provider: AgentProvider) => {
    setConfig((prev) => {
      const next = { ...prev, provider };
      saveAgentConfig(next);
      return next;
    });
  }, []);

  const setApiKey = useCallback((apiKey: string) => {
    setConfig((prev) => {
      const next = { ...prev, apiKey };
      saveAgentConfig(next);
      return next;
    });
  }, []);

  const setModel = useCallback((model: string) => {
    setConfig((prev) => {
      const next = { ...prev, model };
      saveAgentConfig(next);
      return next;
    });
  }, []);

  const setCliId = useCallback((cliId: string) => {
    setConfig((prev) => {
      const next = { ...prev, cliId };
      saveAgentConfig(next);
      return next;
    });
  }, []);

  const setBaseUrl = useCallback((baseUrl: string) => {
    setConfig((prev) => {
      const next = { ...prev, baseUrl };
      saveAgentConfig(next);
      return next;
    });
  }, []);

  return { config, setProvider, setApiKey, setModel, setCliId, setBaseUrl };
}
