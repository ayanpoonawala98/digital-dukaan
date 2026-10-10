import React from 'react';
import { isChunkError, reloadForNewBuild } from '../lib/chunk-reload.js';
// Last line of defence: a failed route chunk or render error shows a recoverable screen, never a blank page.
export class AppBoundary extends React.Component {
  state = { failed: false, chunk: false };
  static getDerivedStateFromError(error) { return { failed: true, chunk: isChunkError(error) }; }
  componentDidCatch(error) { console.error('App crashed', error); if (isChunkError(error)) reloadForNewBuild(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="app-fallback" role="alert">{this.state.chunk ? <><h1>Digital Shop was updated</h1><p>Reload to get the latest version.</p></> : <><h1>Something went wrong</h1><p>Reload to try again.</p></>}<button className="btn btn-green" onClick={() => window.location.reload()}>Reload</button></main>;
  }
}
