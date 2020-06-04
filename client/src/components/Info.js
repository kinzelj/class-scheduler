import React from 'react';
import queryString from 'query-string';
import jwtDecode from 'jwt-decode';

const infoStyle = {display: 'inline-block', marginRight: '10px', marginTop: '10px'};
const jwtStyle = {marginTop: '0px', overflowWrap:'anywhere'};

export default function Info(props) {
    const jwt = queryString.parse(props.location.search).token;
    const data = jwtDecode(jwt);
    const goHome = () => async event => {
        event.preventDefault();
        props.history.push('/');
        return;
    }
    return (
        <div>
            <div className="info">
                <h1>USER INFO</h1>
                <p ><strong>Page Description:</strong> This webpage displays the first and last name of the user authorized with the Google OAuth API,
                along with the unique 'sub' variable and signed JWT provided by Google. <br></br>Click the 'Go Home' button to return to the Welcome page:</p>
                <div><h4 style={infoStyle}>First Name:</h4><p style={infoStyle}>{data.given_name}</p></div>
                <div><h4 style={infoStyle}>Last Name:</h4><p style={infoStyle}>{data.family_name}</p></div>
                <div><h4 style={infoStyle}>User 'sub':</h4><p style={infoStyle}>{data.sub}</p></div>
                <div><h4 style={infoStyle}>JSON Web Token:</h4><p style={jwtStyle}>{jwt}</p></div>
            </div>
            <br></br>
            <form className="ui form">
                <button className="ui button" onClick={goHome()}>Go Home</button>
            </form>
        </div>
    );
}