/**
 * Cross-browser messaging API interface
 * Provides consistent messaging functionality across all browsers
 */

import { EventHandler, AsyncEventHandler, AdapterResult, BaseBrowserAdapter } from './base';

/**
 * Message types for type-safe messaging
 */
export interface BaseMessage {
  type: string;
  timestamp?: number;
  requestId?: string;
}

/**
 * Message sender information
 */
export interface MessageSender {
  tab?: {
    id: number;
    windowId: number;
    url?: string;
    title?: string;
    incognito: boolean;
  };
  frameId?: number;
  id?: string;  // Extension ID
  url?: string;
  origin?: string;
  documentId?: string;
  documentLifecycle?: 'prerender' | 'active' | 'cached' | 'pending_deletion';
}

/**
 * Connection port for long-lived connections
 */
export interface MessagePort {
  name: string;
  sender?: MessageSender;
  
  // Message handling
  postMessage<T = any>(message: T): void;
  onMessage: EventHandler<any>;
  
  // Connection lifecycle
  onDisconnect: EventHandler<MessagePort>;
  disconnect(): void;
  
  // Error handling
  error?: Error;
}

/**
 * Connection options
 */
export interface ConnectOptions {
  name?: string;
  includeTlsChannelId?: boolean;
}

/**
 * External connection options
 */
export interface ExternalConnectOptions extends ConnectOptions {
  extensionId: string;
}

/**
 * Tab connection options
 */
export interface TabConnectOptions extends ConnectOptions {
  tabId: number;
  frameId?: number;
}

/**
 * Native messaging connection options
 */
export interface NativeConnectOptions {
  name: string;
}

/**
 * Message event details
 */
export interface MessageEvent<T = any> {
  message: T;
  sender: MessageSender;
  sendResponse: (response?: any) => void;
}

/**
 * External message event details
 */
export interface ExternalMessageEvent<T = any> extends MessageEvent<T> {
  sender: MessageSender & { id: string };
}

/**
 * Connect event details
 */
export interface ConnectEvent {
  port: MessagePort;
}

/**
 * Cross-browser messaging adapter interface
 */
export interface MessagingAdapter extends BaseBrowserAdapter {
  // Runtime messaging
  sendMessage<T = any, R = any>(
    message: T,
    options?: { includeTlsChannelId?: boolean }
  ): Promise<AdapterResult<R>>;
  
  sendMessageToExtension<T = any, R = any>(
    extensionId: string,
    message: T,
    options?: { includeTlsChannelId?: boolean }
  ): Promise<AdapterResult<R>>;
  
  // Tab messaging
  sendTabMessage<T = any, R = any>(
    tabId: number,
    message: T,
    options?: { frameId?: number }
  ): Promise<AdapterResult<R>>;
  
  // Broadcast messaging
  broadcastToAllTabs<T = any>(
    message: T,
    options?: {
      includeIncognito?: boolean;
      urlPatterns?: string[];
      excludeTabIds?: number[];
    }
  ): Promise<AdapterResult<{ tabId: number; success: boolean; response?: any; error?: Error }[]>>;
  
  broadcastToExtensions<T = any>(
    message: T,
    extensionIds?: string[]
  ): Promise<AdapterResult<{ extensionId: string; success: boolean; response?: any; error?: Error }[]>>;
  
  // Long-lived connections
  connect(connectInfo?: ConnectOptions): AdapterResult<MessagePort>;
  connectToExtension(extensionId: string, connectInfo?: ConnectOptions): AdapterResult<MessagePort>;
  connectToTab(tabId: number, connectInfo?: ConnectOptions): AdapterResult<MessagePort>;
  connectNative?(applicationName: string): AdapterResult<MessagePort>;
  
  // Message routing and handling
  createMessageRouter(): MessageRouter;
  
  // Events
  onMessage: AsyncEventHandler<MessageEvent>;
  onMessageExternal?: AsyncEventHandler<ExternalMessageEvent>;
  onConnect: EventHandler<ConnectEvent>;
  onConnectExternal?: EventHandler<ConnectEvent>;
  onConnectNative?: EventHandler<ConnectEvent>;
  
  // Utility methods
  getLastError(): Error | null;
  isValidMessage(message: any): boolean;
  
  // Browser-specific capabilities
  supportsExternalMessaging(): boolean;
  supportsNativeMessaging(): boolean;
  supportsTabMessaging(): boolean;
  supportsLongLivedConnections(): boolean;
  getMaxMessageSize(): number | null;
}

/**
 * Message router for organizing message handling
 */
export interface MessageRouter {
  // Route registration
  addRoute<T extends BaseMessage, R = any>(
    messageType: string,
    handler: (message: T, sender: MessageSender) => Promise<R> | R
  ): void;
  
  removeRoute(messageType: string): boolean;
  
  // Middleware support
  use(middleware: MessageMiddleware): void;
  
  // Route message to appropriate handler
  route<T extends BaseMessage>(
    message: T,
    sender: MessageSender
  ): Promise<any>;
  
  // Validation
  isRouteRegistered(messageType: string): boolean;
  getRegisteredRoutes(): string[];
}

/**
 * Message middleware for processing messages before routing
 */
export interface MessageMiddleware {
  (
    message: BaseMessage,
    sender: MessageSender,
    next: () => Promise<any>
  ): Promise<any>;
}

/**
 * Typed message handlers for different message types
 */
export interface TypedMessageHandlers {
  [messageType: string]: (message: BaseMessage, sender: MessageSender) => Promise<any> | any;
}

/**
 * Message queue for reliable delivery
 */
export interface MessageQueue {
  enqueue<T = any>(message: T, target: { tabId?: number; extensionId?: string }): Promise<string>; // Returns message ID
  dequeue(): Promise<{ id: string; message: any; target: any } | null>;
  peek(): Promise<{ id: string; message: any; target: any } | null>;
  remove(messageId: string): Promise<boolean>;
  clear(): Promise<void>;
  size(): Promise<number>;
  
  // Retry mechanism
  retry(messageId: string): Promise<boolean>;
  setMaxRetries(count: number): void;
  setRetryDelay(ms: number): void;
  
  // Events
  onMessageSent: EventHandler<{ id: string; success: boolean; error?: Error }>;
  onQueueEmpty: EventHandler<void>;
}

/**
 * Message validation utilities
 */
export interface MessageValidator {
  validate(message: any): boolean;
  validateSchema(message: any, schema: any): boolean;
  sanitize(message: any): any;
  isSecure(message: any, sender: MessageSender): boolean;
}

/**
 * Messaging error types
 */
export class MessagingError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'INVALID_RECIPIENT' | 'MESSAGE_TOO_LARGE' | 'PERMISSION_DENIED' | 'CONNECTION_LOST' | 'UNKNOWN',
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

export class MessageTimeoutError extends MessagingError {
  constructor(timeout: number) {
    super(`Message timed out after ${timeout}ms`, 'TIMEOUT');
    this.name = 'MessageTimeoutError';
  }
}

export class MessageTooLargeError extends MessagingError {
  constructor(messageSize: number, maxSize: number) {
    super(`Message too large: ${messageSize} bytes, max is ${maxSize} bytes`, 'MESSAGE_TOO_LARGE');
    this.name = 'MessageTooLargeError';
  }
}