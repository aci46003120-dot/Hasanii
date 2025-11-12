import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 sm:p-6 ${className}`}>{children}</div>
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'purple' | 'dark' | 'green' | 'orange';

export const Button: React.FC<{ onClick?: () => void; children: React.ReactNode; variant?: ButtonVariant; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; className?: string; title?: string }> = ({ onClick, children, variant = 'primary', disabled = false, type = 'button', className, title }) => {
    const baseClasses = 'px-4 py-2.5 rounded-md font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 flex items-center justify-center transition-colors duration-200 w-full text-sm';
    const variantClasses: Record<ButtonVariant, string> = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500', // Kept for legacy if needed
        secondary: 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
        purple: 'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500',
        dark: 'bg-gray-800 text-white hover:bg-gray-900 focus:ring-gray-700 dark:bg-gray-600 dark:hover:bg-gray-500',
        green: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
        orange: 'bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-400',
    };
    const disabledClasses = 'opacity-50 cursor-not-allowed';
    return <button type={type} onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${disabled ? disabledClasses : ''} ${className}`} disabled={disabled} title={title}>{children}</button>;
};

export const Notification: React.FC<{ message: string; type: 'success' | 'error'; onDismiss: () => void }> = ({ message, type, onDismiss }) => {
    const baseClasses = 'fixed top-5 left-1/2 -translate-x-1/2 w-11/12 max-w-sm p-4 rounded-lg shadow-lg text-white z-50 flex items-center justify-between';
    const typeClasses = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return (
        <div className={`${baseClasses} ${typeClasses}`}>
            <span>{message}</span>
            <button onClick={onDismiss} className="ml-4 text-xl font-bold">&times;</button>
        </div>
    );
};

export const Loader = () => <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>;
export const PageLoader = () => <div className="flex justify-center items-center h-full pt-8"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div></div>;

export const ToggleButton: React.FC<{ isEnabled: boolean; onToggle: () => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean; }> = ({ isEnabled, onToggle, icon, children, disabled = false }) => (
    <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            isEnabled ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={disabled}
    >
        {icon}
        {children}
    </button>
);
