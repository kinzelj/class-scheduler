import React from 'react';
import { Route } from 'react-router-dom';
const axios = require('axios');

export default function Welcome() {
    const [redirect, setRedirect] = React.useState(false);
    const getAuth = props => async event => {
        event.preventDefault();
        const { data } = await axios.get('/oauth/login');
        setRedirect(data.redirect);
        return;
    }
    if (redirect) {
        return (
            <Route path='/' component={() => {
                window.location.href = redirect;
                return null;
            }} />
        )
    }
    else {
        return (
            <div className="welcome">
                <h1>WELCOME</h1>
                <p>This webpage authenticates a user using Google OAuth API and provides a signed JWT required for API requests. 
                <br></br>Click the button below to sign-in and authorize the client server:</p>
                <div>
                    <form className="ui form">
                        <button className="ui button" onClick={getAuth()}>Google Sign-in</button>
                    </form>
                </div>
            </div>
        );
    }
}