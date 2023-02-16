import { useEffect, useState } from 'react'
import LogoutIcon from '@mui/icons-material/Logout';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ClearIcon from '@mui/icons-material/Clear';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import Tooltip from '@mui/material/Tooltip';
import { Link, useLocation, useNavigate } from "react-router-dom"
import Alert from '@mui/material/Alert';

function Edit() {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("shrekku");
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageSeverity, setMessageSeverity] = useState("info");
  const location = useLocation();
  const [requestOptions, setRequestOptions] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if(location.state === null) {
      navigate("/")
    };
    const requestOptions2 = ({
      method: 'GET',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': location.state.token,
      }
    });
    setRequestOptions(requestOptions2);

    fetch("/api/allusers", requestOptions2)
    .then(function(response) {
        if(response.status != 200) throw new Error(response.status);
        return response.json();
      }).then(function(data) {
        setUsers(data);
      }).catch(err => 
        navigate("/")
      );

  }, []);

  function changeActiveStatus(e, username, active, userIndex) {
    var newActive = null;
    if (active === 1) {
      newActive = 0;
    }else {
      newActive = 1;
    };

    fetch(`/api/users/update?username=${username}&active=${newActive}`, requestOptions)
    .then(function(response) {
        if(response.status != 200) return response.text().then(text => { throw new Error(text) })
        return response.json();
      }).then(function(data) {
        var newUsers = [];
        for (let i = 0; i < users.length; i++) {
          newUsers.push(users[i]);
        };
        newUsers[userIndex].active = newActive;
        setUsers(newUsers);
        setShowMessage(false);
      }).catch(err => {
        setMessageText(String(err));
        setMessageSeverity("error");
        setShowMessage(true);
      });
  }

  function deleteUser(e, username, userIndex) {
    fetch(`/api/users/delete?username=${username}`, requestOptions)
    .then(function(response) {
        if(response.status != 200) return response.text().then(text => { throw new Error(text) })
        return response.json();
      }).then(function(data) {
        var newUsers = [];
        for (let i = 0; i < users.length; i++) {
          if( i != userIndex) {
            newUsers.push(users[i]);
          }
        };
        setUsers(newUsers);
        setShowMessage(false);
      }).catch(err => {
        setMessageText(String(err));
        setMessageSeverity("error");
        setShowMessage(true);
      });
  }

  function addUser(e) {
    fetch(`/api/users/add?username=${username}`, requestOptions)
    .then(function(response) {
        if(response.status != 200) return response.text().then(text => { throw new Error(text) })
        return response.json();
      }).then(function(data) {
        var newUsers = [];
        for (let i = 0; i < users.length; i++) {
          newUsers.push(users[i]);
        };
        newUsers.push({username: username, active: 1});
        setUsers(newUsers);
        setUsername("");
        setShowMessage(false);
      }).catch(err => {
        setMessageText(String(err));
        setMessageSeverity("error");
        setShowMessage(true);
      });
  }

  function handleUsernameChange(event) {
    setUsername(event.target.value);
  };

  return (
      <>
        <div className="App">
          <div className='body'>
            <div className='app-nav-bar'>
              <Link to="/">
                <LogoutIcon></LogoutIcon>
              </Link>
              <div></div>
              <div style={{ width: "24px" }}></div>
            </div>
            <div className="edit-box">
              <h3>Add user:</h3>
              <input className="add-new-user-input" name="username" onChange={ e => handleUsernameChange(e)}></input>
              <Tooltip title="Add user" placement="top-end"><button onClick={e => addUser(e)}><PersonAddIcon></PersonAddIcon></button></Tooltip>
            </div>
            { showMessage ? 
              <Alert severity={messageSeverity}>{messageText}</Alert> :
              <div></div>}
            {users.map((user, userIndex) => (
              <div key={user.username} className='edit-box'>
                <h1 style={{marginBottom: '0px'}}>{user.username}</h1>
                <div className='action-icons'>
                  {user.active ?
                    <Tooltip title="Hide from main feed" placement="top-end"><button onClick={e => changeActiveStatus(e, user.username, user.active, userIndex)}><VisibilityOffIcon ></VisibilityOffIcon></button></Tooltip> :
                    <Tooltip title="Show in main feed" placement="top-end"><button onClick={e => changeActiveStatus(e, user.username, user.active, userIndex)}><VisibilityIcon></VisibilityIcon></button></Tooltip>
                  }
                  <Tooltip title="Delete permanently" placement="top-end"><button onClick={e => deleteUser(e, user.username, userIndex)}><ClearIcon></ClearIcon></button></Tooltip>
                </div>
              </div>
              ))}
          </div>
        </div>
      </>
  )
}

export default Edit;
