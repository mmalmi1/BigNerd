import { useEffect, useState } from 'react'

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

// Same 24 skill keys as CardsView.jsx's skillKeys, reordered so "overall" is
// first. Labels are derived by capitalizing each key rather than a separate
// hand-written label list, so they can't drift from the keys themselves.
const SKILL_KEYS = ["overall", "attack", "hitpoints", "mining", "strength", "agility", "smithing", "defence", "herblore",
  "fishing", "ranged", "thieving", "cooking", "prayer", "crafting", "firemaking", "magic",
  "fletching", "woodcutting", "runecrafting", "slayer", "farming", "construction", "hunter"];

const PALETTE = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c"];

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;

// Same k/M suffix formatting as CardsView.jsx's exp-gain display.
function formatGain(gain) {
  return gain < 1000000 ?
    `+${parseInt(gain / 1000)}k` :
    `+${(gain / 1000000).toFixed(1)}M`;
}

function capitalize(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function PlotView({ year, month }) {
  const [skill, setSkill] = useState('overall');
  const [metric, setMetric] = useState('exp');
  const [data, setData] = useState(null); // { column, series }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/plot?year=${year}&month=${month}&skill=${skill}&metric=${metric}`)
      .then(function (response) {
        return response.json();
      }).then(function (json) {
        setData(json);
        setLoading(false);
      });
  }, [year, month, skill, metric]);

  if (loading) {
    return <div></div>;
  }

  const series = data ? data.series : [];

  // Per-user delta-from-first-point series, keeping each user's position in
  // the response array (its color key), regardless of filtering below.
  const userInfos = series.map((user, index) => {
    if (user.points.length === 0) {
      return null;
    }
    const first = user.points[0].value;
    const deltas = user.points.map((p) => ({ capturedAt: p.capturedAt, delta: p.value - first }));
    return {
      username: user.username,
      index,
      deltas,
      hasLine: deltas.length >= 2,
      gain: deltas[deltas.length - 1].delta,
    };
  }).filter((u) => u !== null);

  const chartUsers = userInfos.filter((u) => u.hasLine);

  // Combined min/max across ALL drawn points from ALL users -- not computed
  // per-user -- so x maps proportionally to real capturedAt timestamps.
  const allTimes = chartUsers.flatMap((u) => u.deltas.map((d) => Date.parse(d.capturedAt)));
  const minTime = allTimes.length ? Math.min(...allTimes) : 0;
  const maxTime = allTimes.length ? Math.max(...allTimes) : 0;
  const timeSpan = maxTime - minTime;

  const allDeltas = chartUsers.flatMap((u) => u.deltas.map((d) => d.delta));
  let minDelta = allDeltas.length ? Math.min(0, ...allDeltas) : 0;
  let maxDelta = allDeltas.length ? Math.max(0, ...allDeltas) : 0;
  if (minDelta === maxDelta) {
    minDelta = -1;
    maxDelta = 1;
  }
  const deltaSpan = maxDelta - minDelta;

  function toX(time) {
    return maxTime === minTime ? 0 : ((time - minTime) / timeSpan) * VIEWBOX_WIDTH;
  }

  function toY(delta) {
    const normalized = (delta - minDelta) / deltaSpan;
    return VIEWBOX_HEIGHT - normalized * VIEWBOX_HEIGHT;
  }

  return (
    <div className='content'>
      <div className='nav-selectors'>
        <select
          className='skill-select'
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        >
          {SKILL_KEYS.map((key) => (
            <option key={key} value={key}>{capitalize(key)}</option>
          ))}
        </select>
        <div className='view-toggle'>
          <button
            className={`view-toggle-btn${metric === 'lvl' ? ' view-toggle-btn--active' : ''}`}
            onClick={() => setMetric('lvl')}
          >
            Level
          </button>
          <button
            className={`view-toggle-btn${metric === 'exp' ? ' view-toggle-btn--active' : ''}`}
            onClick={() => setMetric('exp')}
          >
            XP
          </button>
        </div>
      </div>
      <p>{month === 'all' ? `${year}` : `${MONTH_NAMES[Number(month) - 1]} ${year}`}</p>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        width='100%'
        height={VIEWBOX_HEIGHT}
        preserveAspectRatio='none'
      >
        {chartUsers.map((user) => (
          <polyline
            key={user.username}
            points={user.deltas.map((d) => `${toX(Date.parse(d.capturedAt))},${toY(d.delta)}`).join(' ')}
            fill='none'
            stroke={PALETTE[user.index % PALETTE.length]}
            strokeWidth='2'
          />
        ))}
      </svg>
      <div className='plot-legend'>
        {userInfos.map((user) => (
          <div key={user.username} style={{ display: 'flex', alignItems: 'center', gap: '1ch' }}>
            <span
              style={{
                display: 'inline-block',
                width: '1.2ch',
                height: '1.2ch',
                borderRadius: '50%',
                backgroundColor: user.hasLine ? PALETTE[user.index % PALETTE.length] : 'gray',
              }}
            ></span>
            <span>{user.username}</span>
            <span>{formatGain(user.gain)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PlotView
