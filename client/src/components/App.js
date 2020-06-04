import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Welcome from './Welcome.js';
import Info from './Info.js';

export default function App() {
  const App = () => (
    <div style={{width: '90%', margin: 'auto', marginTop: '20px'}}>
      <Switch>
        <Route exact path='/' component={Welcome} />
        <Route path='/info' component={Info} />
      </Switch>
    </div>
  )
  return (
    <Switch>
      <App />
    </Switch>
  );
}