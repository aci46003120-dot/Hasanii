import React from 'react';
import { BrainIcon, PhoneHangupIcon, MicrophoneIcon, MicrophoneSlashIcon } from './Icons';

type CallStatus = 'connecting' | 'connected' | 'ended' | 'error';

interface LiveCallViewProps {
    status: CallStatus;
    duration: number; // in seconds
    isMuted: boolean;
    onToggleMute: () => void;
    onEndCall: () => void;
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
};

const StatusDisplay: React.FC<{ status: CallStatus }> = ({ status }) => {
    switch (status) {
        case 'connecting':
            return <p className="text-lg text-gray-300 animate-pulse">جاري الاتصال...</p>;
        case 'connected':
            return <p className="text-lg text-green-400">متصل</p>;
        case 'ended':
            return <p className="text-lg text-gray-300">تم إنهاء المكالمة</p>;
        case 'error':
            return <p className="text-lg text-red-400">فشل الاتصال</p>;
        default:
            return null;
    }
};

const LiveCallView: React.FC<LiveCallViewProps> = ({ status, duration, isMuted, onToggleMute, onEndCall }) => {
    return (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-md z-50 flex flex-col items-center justify-between p-8 text-white animate-fade-in">
            {/* Top Section: Status */}
            <div className="text-center mt-16">
                <StatusDisplay status={status} />
                {status === 'connected' && (
                    <p className="text-5xl font-mono tracking-wider mt-2">{formatDuration(duration)}</p>
                )}
            </div>

            {/* Middle Section: Avatar */}
            <div className="relative flex items-center justify-center">
                 <div className={`absolute w-64 h-64 bg-indigo-500/20 rounded-full ${status === 'connected' ? 'animate-pulse-slow' : ''}`}></div>
                 <div className={`absolute w-48 h-48 bg-indigo-500/30 rounded-full ${status === 'connected' ? 'animate-pulse-medium' : ''}`}></div>
                <div className="bg-white/10 p-6 rounded-full">
                    <BrainIcon className="w-16 h-16 text-indigo-300" />
                </div>
            </div>

            {/* Bottom Section: Controls */}
            <div className="w-full max-w-xs flex items-center justify-around mb-8">
                <button
                    onClick={onToggleMute}
                    className="flex flex-col items-center gap-2 text-gray-300 hover:text-white transition-colors"
                    aria-label={isMuted ? "إلغاء كتم الصوت" : "كتم الصوت"}
                >
                    <div className="bg-white/20 p-4 rounded-full">
                        {isMuted ? <MicrophoneSlashIcon /> : <MicrophoneIcon />}
                    </div>
                    <span className="text-xs">{isMuted ? 'إلغاء الكتم' : 'كتم'}</span>
                </button>

                <button
                    onClick={onEndCall}
                    className="bg-red-600 hover:bg-red-700 transition-colors p-5 rounded-full shadow-lg"
                    aria-label="إنهاء المكالمة"
                >
                    <PhoneHangupIcon />
                </button>

                <div className="w-24"></div>
            </div>
             <style>{`
                .animate-fade-in { animation: fadeIn 0.3s ease-out; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                .animate-pulse-medium { animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 0.5s; }
                @keyframes pulse {
                  50% {
                    opacity: 0.5;
                    transform: scale(1.1);
                  }
                }
            `}</style>
        </div>
    );
};

export default LiveCallView;
