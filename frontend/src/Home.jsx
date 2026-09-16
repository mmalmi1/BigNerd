import { useEffect, useState } from 'react'
import { Link } from "react-router-dom"
import LoginIcon from '@mui/icons-material/Login';
import CardsView from './CardsView';

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function Home() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(null);
  const [years, setYears] = useState([]);
  const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
  const [view, setView] = useState('cards');

  useEffect(() => {
    fetch("/api/years")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Failed to fetch years");
        }
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) {
          throw new Error("Unexpected /api/years response");
        }
        setYears(data);
        if (data.includes(currentYear)) {
          setYear(currentYear);
        } else if (data.length !== 0) {
          setYear(data[data.length - 1]);
        } else {
          setYear(currentYear);
        }
      })
      .catch(function () {
        setYear(currentYear);
      });
  }, []);

  const yearOptions = year !== null ? (years.length !== 0 ? years : [currentYear]) : [];

  return (
    <>
      <div className="App">
        <div className='body'>
          <div className='app-nav-bar'>
            <div className='nav-right'>
              <div className='view-toggle'>
                <button
                  className={`view-toggle-btn${view === 'cards' ? ' view-toggle-btn--active' : ''}`}
                  onClick={() => setView('cards')}
                >
                  Cards
                </button>
                <button
                  className={`view-toggle-btn${view === 'plot' ? ' view-toggle-btn--active' : ''}`}
                  onClick={() => setView('plot')}
                >
                  Plot
                </button>
              </div>
              <Link to="/login">
                <LoginIcon></LoginIcon>
              </Link>
            </div>
            {year === null ?
              <div></div> :
              <h1>{month === 'all' ? `${year}'s Big Nerd` : `${MONTH_NAMES[Number(month) - 1]}'s Big Nerd`}</h1>
            }
            <div className='nav-selectors'>
              <select
                className='year-select'
                value={year !== null ? year : currentYear}
                disabled={year === null}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {year === null ?
                  <option>{currentYear}</option> :
                  yearOptions.map((y) => <option key={y} value={y}>{y}</option>)
                }
              </select>
              <select
                className='month-select'
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={String(i + 1)}>{name}</option>
                ))}
                <option value="all">Whole year</option>
              </select>
            </div>
          </div>
          {view === 'cards'
            ? (year === null
                ? <div className="content"><p>Loading…</p></div>
                : <CardsView year={year} month={month} />)
            : <div className="content"><p>Plot view coming soon.</p></div>
          }
        </div>
      </div >
    </>
  )
}

export default Home
