import { useEffect, useState } from 'react'
import { Link} from "react-router-dom"
import attack from './assets/RS_icons/skill_icon_attack1.gif'; 
import hitpoints from './assets/RS_icons/skill_icon_hitpoints1.gif';
import mining from './assets/RS_icons/skill_icon_mining1.gif';
import strength from './assets/RS_icons/skill_icon_strength1.gif';
import agility from './assets/RS_icons/skill_icon_agility1.gif';
import smithing from './assets/RS_icons/skill_icon_smithing1.gif';
import defence from './assets/RS_icons/skill_icon_defence1.gif';
import herblore from './assets/RS_icons/skill_icon_herblore1.gif';
import fishing from './assets/RS_icons/skill_icon_fishing1.gif';
import ranged from './assets/RS_icons/skill_icon_ranged1.gif';
import thieving from './assets/RS_icons/skill_icon_thieving1.gif';
import cooking from './assets/RS_icons/skill_icon_cooking1.gif';
import prayer from './assets/RS_icons/skill_icon_prayer1.gif';
import crafting from './assets/RS_icons/skill_icon_crafting1.gif';
import firemaking from './assets/RS_icons/skill_icon_firemaking1.gif';
import magic from './assets/RS_icons/skill_icon_magic1.gif';
import fletching from './assets/RS_icons/skill_icon_fletching1.gif';
import woodcutting from './assets/RS_icons/skill_icon_woodcutting1.gif';
import runecraft from './assets/RS_icons/skill_icon_runecraft1.gif';
import slayer from './assets/RS_icons/skill_icon_slayer1.gif';
import farming from './assets/RS_icons/skill_icon_farming1.gif';
import construction from './assets/RS_icons/skill_icon_construction1.gif';
import hunter from './assets/RS_icons/skill_icon_hunter1.gif';
import overall from './assets/RS_icons/overall1.png';
import LoginIcon from '@mui/icons-material/Login';

function Home() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState("");
  const icons = [attack, hitpoints, mining, strength, agility, smithing, defence, herblore,
                fishing, ranged, thieving, cooking, prayer, crafting, firemaking, magic,
                fletching, woodcutting, runecraft, slayer, farming, construction, hunter, null]
  const skillKeys = ["attack", "hitpoints", "mining", "strength", "agility", "smithing", "defence", "herblore",
    "fishing", "ranged", "thieving", "cooking", "prayer", "crafting", "firemaking", "magic",
    "fletching", "woodcutting", "runecrafting", "slayer", "farming", "construction", "hunter", "overall"]

  useEffect(() => {
    fetch("/api/users")
    .then(function(response) {
        return response.json();
      }).then(function(data) {
        setUsers(data);
        if (data.length != 0) {
          setMonth(getMonthName(data[0][1]["startMonth"]))
        } else {
          const date = new Date();
          setMonth(date.toLocaleString("en-GB", {month: 'long',}));
        }
        setLoading(false);
      });

  }, []);

  function getMonthName(monthNumber) {
    const date = new Date();
    date.setMonth(monthNumber - 1);
  
    return date.toLocaleString("en-GB", {
      month: 'long',
    });
  }

  return (
    <>
      <div className="App">
        <div className='body'>
          <div className='app-nav-bar'>
            <Link to="/login">
              <LoginIcon></LoginIcon>
            </Link>
            {loading ? 
            <div></div> :
            <h1>{month}'s Big Nerd</h1>
            }
            <div style={{ width: "24px" }}></div>
          </div>
          {loading ? 
            <div></div> :            
            users.map((user, userRank) => (
              <div key={user[2]["id"]} className='box'>
                {<h1>{userRank + 1}. {user[0]}</h1>}
                <div className='all-skills-box'>
                  {skillKeys.map((skill, i) =>
                    <div className='skill-box' key={skill}>
                      <div style={{ width: "5ch" }}>
                        <img src={icons[i]}></img>
                        {`${user[2][`${skill}Lvl`]}`}
                        </div>
                        <div style={{ width: "3ch", textAlign: 'right' }}>
                          {`+${user[2][`${skill}Lvl`] - user[1][`${skill}Lvl`]}`}
                        </div>
                        <div style={{ width: "5ch", textAlign: 'right' }}>
                          {user[2][`${skill}Exp`] - user[1][`${skill}Exp`] < 1000000 ?
                            `+${parseInt((user[2][`${skill}Exp`] - user[1][`${skill}Exp`]) / 1000)}k` :
                            `+${((user[2][`${skill}Exp`] - user[1][`${skill}Exp`]) / 1000000).toFixed(1)}M`}
                        </div>
                      </div>
                    )}
                    <div></div>
                    <div></div>
                    <p className='footnote'>Tracked since {user[1]["startDay"]}.{user[1]["startMonth"]}.{user[1]["startYear"]}</p>
                  </div>

                </div>
              ))
            }
          </div>
        </div>
      </>
    )
}

export default Home