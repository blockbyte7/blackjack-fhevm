import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import logo from '@/assets/cipherjack-logo.jpeg';

interface WelcomeScreenProps {
  onJoin: (name: string) => void;
}

export const WelcomeScreen = ({ onJoin }: WelcomeScreenProps) => {
  const [playerName, setPlayerName] = useState('');

  const handleJoin = () => {
    if (playerName.trim()) {
      onJoin(playerName.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] p-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img 
            src={logo} 
            alt="CipherJack" 
            className="mx-auto w-64 h-64 object-contain mb-8"
          />
          <h1 className="text-4xl font-bold text-primary mb-4">
            Welcome to CipherJack
          </h1>
          <p className="text-muted-foreground text-lg">
            Enter your name to join the table
          </p>
        </div>

        <div className="space-y-4">
          <Input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            className="text-lg py-6 border-primary/50 focus:border-primary bg-card"
          />
          <Button
            onClick={handleJoin}
            className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            size="lg"
          >
            Join Game
          </Button>
        </div>
      </div>
    </div>
  );
};
