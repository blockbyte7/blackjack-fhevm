import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { BlackjackTable } from '@/components/blackjack/BlackjackTable';

const Game = () => {
  const params = useParams();
  const tableIdParam = params.tableId;
  const tableId = useMemo(() => {
    try {
      if (!tableIdParam) return undefined;
      const parsed = BigInt(tableIdParam);
      return parsed > 0n ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [tableIdParam]);

  return <BlackjackTable tableId={tableId} />;
};

export default Game;
