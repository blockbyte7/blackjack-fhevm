interface FireworksProps {
  active: boolean;
}

const FIREWORK_COORDS = [
  { left: '15%', top: '25%' },
  { left: '50%', top: '18%' },
  { left: '80%', top: '28%' },
  { left: '25%', top: '55%' },
  { left: '70%', top: '60%' },
  { left: '45%', top: '40%' }
];

export const Fireworks = ({ active }: FireworksProps) => {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {FIREWORK_COORDS.map((coord, index) => (
        <div key={index} style={{ ...coord, animationDelay: `${index * 120}ms` }} className="firework">
          <span className="spark spark-1" />
          <span className="spark spark-2" />
          <span className="spark spark-3" />
        </div>
      ))}
    </div>
  );
};
