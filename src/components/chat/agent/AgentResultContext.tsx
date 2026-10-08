'use client';
import { createContext, useContext } from 'react';

export const AgentResultContext = createContext<{ openResource: (id: string) => void } | null>(null);
export const useAgentResultWorkspace = () => useContext(AgentResultContext);
