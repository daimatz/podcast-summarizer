import * as fs from 'fs';
import * as path from 'path';

export interface PodcastEntry {
  id: string;
  name: string;
  feedId: string;
}

export interface Config {
  podcasts: PodcastEntry[];
}

export interface State {
  lastChecked: Record<string, number>; // feedId -> timestamp (ms)
}

const CONFIG_PATH = path.join(process.cwd(), 'config', 'podcasts.json');
const STATE_PATH = path.join(process.cwd(), 'state', 'last-checked.json');

export function getConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { podcasts: [] };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

export function getState(): State {
  if (!fs.existsSync(STATE_PATH)) {
    return { lastChecked: {} };
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
}

export function saveState(state: State): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function getLastChecked(feedId: string): Date | null {
  const state = getState();
  const timestamp = state.lastChecked[feedId];
  return timestamp ? new Date(timestamp) : null;
}

export function setLastChecked(feedId: string, date: Date): void {
  const state = getState();
  state.lastChecked[feedId] = date.getTime();
  saveState(state);
}

export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}
