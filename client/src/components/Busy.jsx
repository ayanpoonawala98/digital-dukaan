import React from 'react';
export default function Busy({ children, active = false }) { return <>{active && <span className="button-spinner" aria-hidden="true"/>}{children}</>; }
