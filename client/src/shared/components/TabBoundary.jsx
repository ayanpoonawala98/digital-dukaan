import { ot } from '../lib/owner-i18n.js';
import React from 'react';
// One broken tab must never blank the app. Resets when the tab key changes.
export class TabBoundary extends React.Component {
  state = { failed: false, key: this.props.tabKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props, state) { return props.tabKey !== state.key ? { failed: false, key: props.tabKey } : null; }
  componentDidCatch(error) { console.error('Tab crashed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="dashboard-panel"><h3>{ot("This section could not load")}</h3><p className="muted">{ot("Everything else still works. Try again, or pick another section.")}</p><button className="btn btn-outline" onClick={() => this.setState({ failed: false })}>{ot("Try again")}</button></div>;
  }
}
