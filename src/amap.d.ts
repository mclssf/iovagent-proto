/// <reference types="vite/client" />
/// <reference types="@amap/amap-jsapi-types" />

declare namespace AMap {
  class ToolBar extends Control {
    constructor(options?: { position?: 'LB' | 'LT' | 'RB' | 'RT' });
  }
}

interface Window {
  AMapLoader?: {
    load(options: { key: string; plugins?: string[]; version: string }): Promise<typeof AMap>;
  };
  _AMapSecurityConfig?: {
    serviceHost?: string;
  };
}
