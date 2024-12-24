const CEX = ["mexc", "kucoin", "gate", "bitget"] as const

export const EXCHANGES = {
    // Основные биржи
    // MAIN: MAIN,
    
    // Биржи по умолчанию для обычного режима
    DEFAULT: [...CEX, "dexscreener"] as const,
    
    // Биржи для CEX режима
    CEX,
    
    // Все доступные биржи включая DEX
    ALL: [...CEX, "dexscreener"] as const,
} as const;

// Тип для названий бирж
export type ExchangeName = typeof EXCHANGES.ALL[number];

// Функция для проверки валидности биржи
export function isValidExchange(exchange: string): exchange is ExchangeName {
    return EXCHANGES.ALL.includes(exchange as ExchangeName);
} 