import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getMarketDay, gregorianToJdn, marketAnchor, type Locale } from 'shan-market-day';
import './style.css';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const groupNames = ['Taunggyi', 'Taung Ni', 'Shwenyaung', 'Nyaungshwe', 'Heho'];
const pad = (value: number) => String(value).padStart(2, '0');
const dateLabel = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;

function App() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(10);
  const [selectedDay, setSelectedDay] = useState(5);
  const [locale, setLocale] = useState<Locale>('my');
  const firstJdn = gregorianToJdn(year, month, 1);
  const startWeekday = (firstJdn + 1) % 7;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const days = year === 9999 && month === 12
    ? 31
    : gregorianToJdn(nextYear, nextMonth, 1) - firstJdn;
  const jdn = gregorianToJdn(year, month, selectedDay);
  const result = getMarketDay(jdn);
  const title = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateLabel(year, month, 1)}T12:00:00Z`));

  function changeMonth(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return;
    const y = Number(match[1]);
    const m = Number(match[2]);
    if (y < 1 || y > 9999 || m < 1 || m > 12) return;
    setYear(y);
    setMonth(m);
    setSelectedDay(1);
  }

  function moveMonth(offset: number) {
    const total = year * 12 + month - 1 + offset;
    setYear(Math.floor(total / 12));
    setMonth(total % 12 + 1);
    setSelectedDay(1);
  }

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">Shan Market Day · Calculation preview</p>
          <h1>Five-day market calendar</h1>
          <p>Scheduled rotation only. This does not confirm that a market is open.</p>
        </div>
        <label>Market labels
          <select value={locale} onChange={event => setLocale(event.target.value === 'en' ? 'en' : 'my')}>
            <option value="my">Myanmar</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>
      <div className="layout">
        <section className="calendar" aria-label="Monthly market calendar">
          <div className="toolbar">
            <button aria-label="Previous month" disabled={year === 1 && month === 1} onClick={() => moveMonth(-1)}>Previous</button>
            <h2>{title}</h2>
            <button aria-label="Next month" disabled={year === 9999 && month === 12} onClick={() => moveMonth(1)}>Next</button>
          </div>
          <div className="controls">
            <label>Jump to month <input type="month" min="0001-01" max="9999-12"
              value={`${year.toString().padStart(4, '0')}-${pad(month)}`}
              onChange={event => changeMonth(event.target.value)} /></label>
            <button onClick={() => { setYear(2026); setMonth(10); setSelectedDay(5); }}>Anchor: Oct 5, 2026</button>
          </div>
          <div className="grid">
            {weekdays.map(day => <div className="weekday" key={day}>{day}</div>)}
            {Array.from({ length: startWeekday }, (_, index) => <div className="empty" key={`empty-${index}`} />)}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const dayJdn = firstJdn + index;
              const market = getMarketDay(dayJdn);
              return (
                <button key={day} className={`day group-${market.groupOrder} ${day === selectedDay ? 'selected' : ''}`}
                  aria-pressed={day === selectedDay}
                  aria-label={`${dateLabel(year, month, day)}: ${groupNames[market.groupOrder]}`}
                  onClick={() => setSelectedDay(day)}>
                  <strong>{day}</strong>
                  <span>{groupNames[market.groupOrder]}</span>
                  <small>JDN {dayJdn}</small>
                  {dayJdn === marketAnchor.jdn && <b className="anchor">Anchor</b>}
                </button>
              );
            })}
          </div>
          <div className="legend">{groupNames.map((name, index) =>
            <span className={`group-${index}`} key={name}>{index}: {name}</span>)}</div>
          <p className="note">Historical checks: November and December 2025 follow the same cycle. Use “Jump to month” to compare.</p>
        </section>
        <aside aria-live="polite">
          <h2>{dateLabel(year, month, selectedDay)}</h2>
          <h3>{groupNames[result.groupOrder]} group</h3>
          <ol className="flow">
            <li>Gregorian civil date <code>{dateLabel(year, month, selectedDay)}</code></li>
            <li>Our Gregorian conversion <code>JDN {jdn}</code></li>
            <li>Offset from Heho anchor <code>{jdn - marketAnchor.jdn} days</code></li>
            <li>Positive modulo <code>mod(4 + {jdn - marketAnchor.jdn}, 5) = {result.groupOrder}</code></li>
            <li>Scheduled group <code>{result.groupId} / {result.group}</code></li>
          </ol>
          <p><strong>{result.markets.length} markets</strong> · labels {result.datasetStatus}</p>
          <ul className="markets">{result.markets.map(market =>
            <li key={market.id}><span>{market.name[locale]}</span><small>{market.id}</small></li>)}</ul>
        </aside>
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing calendar root element');
createRoot(root).render(<App />);
