const glyphs = ['◆', '◇', '○', '●', '✦', '✧', '⬡', '⬢'];

export const EncryptionOrb = () => {
  const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];

  return (
    <div className="encryption-orb">
      <div className="encryption-ring encryption-ring--outer" />
      <div className="encryption-ring encryption-ring--middle" />
      <div className="encryption-ring encryption-ring--inner" />
      <div className="encryption-core">
        <span className="encryption-core__glyph">{glyph}</span>
        <span className="encryption-core__lock" />
      </div>
    </div>
  );
};

export default EncryptionOrb;
