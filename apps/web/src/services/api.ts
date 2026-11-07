import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3333';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function createWebSocketConnection(): Socket {
  return io(WS_BASE_URL, {
    transports: ['websocket', 'polling'],
  });
}
