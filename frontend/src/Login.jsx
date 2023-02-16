import { useEffect, useState } from 'react'
import HomeIcon from '@mui/icons-material/Home';
import { Link, useNavigate } from "react-router-dom"
import Alert from '@mui/material/Alert';

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageSeverity, setMessageSeverity] = useState("info");
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "username": username, "password": password })
    };
    fetch('/api/login', requestOptions)
      .then(function(response) {
        if(response.status != 200) return response.text().then(text => { throw new Error(text) })
        return response.json();
      })
      .then(data => {
        navigate("/Edit", { state: data});
      })
      .catch(err => {
        setMessageText(String(err));
        setMessageSeverity("error");
        setShowMessage(true);
      });
  };

  function handleUsernameChange(event) {
    setUsername(event.target.value);
  };

  function handlePasswordChange(event) {
    setPassword(event.target.value);
  };

  return (
      <>
        <div className="App">
          <div className='body'>
            <div className='app-nav-bar'>
              <Link to="/">
                <HomeIcon></HomeIcon>
              </Link>
              <div></div>
              <div style={{ width: "24px" }}></div>
            </div>
            <form className="login-form" onSubmit={e => handleSubmit(e)}>
              <div className="input-group">
                <h3>Username</h3>
                <input name="username" value={username} onChange={ e => handleUsernameChange(e)} />
              </div>
              <div className="input-group">
                <h3>Password</h3>
                <input type="password" name="password" value={password} onChange={ e => handlePasswordChange(e)} />
              </div>
              <input className="login-button" type="submit" value="Login" />
            </form>
            { showMessage ? 
              <Alert severity={messageSeverity}>{messageText}</Alert> :
              <div></div>}
          </div>
        </div>
      </>
  )
}

export default Login;
