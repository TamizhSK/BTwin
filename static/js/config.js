// Configuration for the Battery Digital Twin Dashboard
const CONFIG = {
    // Chart settings
    MAX_DATA_POINTS: 100,
    CHART_UPDATE_INTERVAL: 2000, // milliseconds
    
    // Terminal-style colors
    COLORS: {
        voltage: '#00ff00',
        current: '#00ffff', 
        power: '#ffff00',
        temperature: '#ff8800'
    },
    
    // Gauge ranges
    GAUGES: {
        temperature: {
            min: 0,
            max: 60,
            ranges: [
                { min: 0, max: 15, color: 'rgba(0,255,0,0.3)' },   // Good
                { min: 15, max: 35, color: 'rgba(255,255,0,0.3)' },  // Warning
                { min: 35, max: 60, color: 'rgba(255,0,0,0.3)' }   // Critical
            ]
        },
        power: {
            min: 0,
            max: 10,
            ranges: [
                { min: 0, max: 3, color: 'rgba(0,255,0,0.3)' },   // Good
                { min: 3, max: 7, color: 'rgba(255,255,0,0.3)' }, // Warning
                { min: 7, max: 10, color: 'rgba(255,0,0,0.3)' } // Critical
            ]
        }
    },
    
    // Metric thresholds
    THRESHOLDS: {
        temperature: {
            warning: 30,
            critical: 40
        },
        power: {
            warning: 500,
            critical: 800
        },
        voltage: {
            warning: 3.0,
            critical: 2.5
        }
    }
};
