// Dashboard JavaScript for Battery Digital Twin
class BatteryDashboard {
    constructor() {
        this.socket = io();
        this.chartData = {
            voltage: [],
            current: [],
            power: [],
            temp: [],
            timestamps: []
        };
        this.MAX_POINTS = CONFIG.MAX_DATA_POINTS;
        this.init();
    }

    init() {
        this.initSocketEvents();
        this.initCharts();
        console.log('Battery Dashboard initialized');
    }

    initSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });

        this.socket.on('new_data', (data) => {
            console.log('New data received:', data);
            this.updateMetrics(data);
            this.updateCharts(data);
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (connected) {
            statusEl.textContent = 'CONNECTED';
            statusEl.className = 'status connected';
        } else {
            statusEl.textContent = 'DISCONNECTED';
            statusEl.className = 'status disconnected';
        }
    }

    initCharts() {
        const chartConfig = {
            margin: { l: 60, r: 40, t: 30, b: 60 },
            hovermode: 'x unified',
            responsive: true,
            plot_bgcolor: '#000000',
            paper_bgcolor: '#111111',
            font: { color: '#00ff00', family: 'Courier New' },
            xaxis: { 
                gridcolor: '#333333',
                color: '#00ff00'
            },
            yaxis: { 
                gridcolor: '#333333',
                color: '#00ff00'
            }
        };

        // Voltage chart
        Plotly.newPlot('voltageChart', 
            [{
                x: [], y: [], 
                type: 'scatter', 
                mode: 'lines+markers', 
                name: 'Voltage', 
                line: { color: CONFIG.COLORS.voltage, width: 2 },
                marker: { color: CONFIG.COLORS.voltage }
            }],
            { ...chartConfig, xaxis: { ...chartConfig.xaxis, title: 'Time' }, yaxis: { ...chartConfig.yaxis, title: 'Voltage (V)' } }
        );

        // Current chart
        Plotly.newPlot('currentChart',
            [{
                x: [], y: [], 
                type: 'scatter', 
                mode: 'lines+markers',
                name: 'Current', 
                line: { color: CONFIG.COLORS.current, width: 2 },
                marker: { color: CONFIG.COLORS.current }
            }],
            { ...chartConfig, xaxis: { ...chartConfig.xaxis, title: 'Time' }, yaxis: { ...chartConfig.yaxis, title: 'Current (mA)' } }
        );

        // Power chart
        Plotly.newPlot('powerChart',
            [{
                x: [], y: [], 
                type: 'scatter', 
                mode: 'lines+markers',
                name: 'Power', 
                line: { color: CONFIG.COLORS.power, width: 2 },
                marker: { color: CONFIG.COLORS.power }
            }],
            { ...chartConfig, xaxis: { ...chartConfig.xaxis, title: 'Time' }, yaxis: { ...chartConfig.yaxis, title: 'Power (mW)' } }
        );

        // Temperature chart
        Plotly.newPlot('tempChart',
            [{
                x: [], y: [], 
                type: 'scatter', 
                mode: 'lines+markers',
                name: 'Temperature', 
                line: { color: CONFIG.COLORS.temperature, width: 2 },
                marker: { color: CONFIG.COLORS.temperature }
            }],
            { ...chartConfig, xaxis: { ...chartConfig.xaxis, title: 'Time' }, yaxis: { ...chartConfig.yaxis, title: 'Temperature (°C)' } }
        );

        this.initGauges();
    }

    initGauges() {
        const gaugeConfig = { 
            margin: { l: 30, r: 30, t: 60, b: 30 }, 
            responsive: true,
            plot_bgcolor: '#000000',
            paper_bgcolor: '#111111',
            font: { color: '#00ff00', family: 'Courier New' }
        };

        // Temperature gauge
        const tempGauge = CONFIG.GAUGES.temperature;
        Plotly.newPlot('tempGauge',
            [{
                type: 'indicator', 
                mode: 'gauge+number+delta', 
                value: 25,
                title: { text: 'TEMP °C', font: { color: '#00ff00', size: 16 } },
                number: { font: { color: '#00ff00', size: 24 } },
                gauge: {
                    axis: { 
                        range: [tempGauge.min, tempGauge.max], 
                        tickcolor: '#00ff00',
                        tickfont: { color: '#00ff00' }
                    },
                    bar: { color: CONFIG.COLORS.temperature, thickness: 0.8 },
                    bgcolor: '#000000',
                    bordercolor: '#00ff00',
                    borderwidth: 2,
                    steps: tempGauge.ranges.map(range => ({
                        range: [range.min, range.max], 
                        color: range.color
                    })),
                    threshold: {
                        line: { color: '#ff0000', width: 4 },
                        thickness: 0.75,
                        value: 40
                    }
                }
            }],
            gaugeConfig
        );

        // Power gauge
        const powerGauge = CONFIG.GAUGES.power;
        Plotly.newPlot('powerGauge',
            [{
                type: 'indicator', 
                mode: 'gauge+number+delta', 
                value: 0,
                title: { text: 'POWER mW', font: { color: '#00ff00', size: 16 } },
                number: { font: { color: '#00ff00', size: 24 } },
                gauge: {
                    axis: { 
                        range: [powerGauge.min, powerGauge.max], 
                        tickcolor: '#00ff00',
                        tickfont: { color: '#00ff00' }
                    },
                    bar: { color: CONFIG.COLORS.power, thickness: 0.8 },
                    bgcolor: '#000000',
                    bordercolor: '#00ff00',
                    borderwidth: 2,
                    steps: powerGauge.ranges.map(range => ({
                        range: [range.min, range.max], 
                        color: range.color
                    })),
                    threshold: {
                        line: { color: '#ff0000', width: 4 },
                        thickness: 0.75,
                        value: 8
                    }
                }
            }],
            gaugeConfig
        );
    }

    updateMetrics(data) {
        const metrics = [
            { id: 'voltageValue', value: data.bus_voltage || 0, decimals: 3 },
            { id: 'currentValue', value: data.ina_current_mA || 0, decimals: 1 },
            { id: 'powerValue', value: (data.bus_voltage || 0) * Math.abs(data.ina_current_mA || 0), decimals: 1 },
            { id: 'tempValue', value: data.temp || 0, decimals: 1 },
            { id: 'acsCurrentValue', value: data.acs_current_A || 0, decimals: 3 },
            { id: 'wifiValue', value: data.wifi_rssi || -100, decimals: 0 }
        ];

        metrics.forEach(metric => {
            const element = document.getElementById(metric.id);
            if (element) {
                element.textContent = metric.value.toFixed(metric.decimals);
            }
        });

        // Update timestamp
        const now = new Date();
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = 'LAST UPDATE: ' + now.toLocaleTimeString().toUpperCase();
        }

        // Update metric card status based on values
        this.updateMetricStatus(data);
    }

    updateMetricStatus(data) {
        // Temperature status
        const tempCard = document.querySelector('#tempValue').closest('.metric-card');
        const temp = data.temp || 0;
        tempCard.className = 'metric-card';
        if (temp > CONFIG.THRESHOLDS.temperature.critical) {
            tempCard.classList.add('critical');
        } else if (temp > CONFIG.THRESHOLDS.temperature.warning) {
            tempCard.classList.add('warning');
        }

        // Power status
        const powerCard = document.querySelector('#powerValue').closest('.metric-card');
        const power = (data.bus_voltage || 0) * Math.abs(data.ina_current_mA || 0);
        powerCard.className = 'metric-card';
        if (power > CONFIG.THRESHOLDS.power.critical) {
            powerCard.classList.add('critical');
        } else if (power > CONFIG.THRESHOLDS.power.warning) {
            powerCard.classList.add('warning');
        }

        // Voltage status
        const voltageCard = document.querySelector('#voltageValue').closest('.metric-card');
        const voltage = data.bus_voltage || 0;
        voltageCard.className = 'metric-card';
        if (voltage < CONFIG.THRESHOLDS.voltage.critical) {
            voltageCard.classList.add('critical');
        } else if (voltage < CONFIG.THRESHOLDS.voltage.warning) {
            voltageCard.classList.add('warning');
        }
    }

    updateCharts(data) {
        const time = new Date().toLocaleTimeString();
        
        // Calculate power from voltage and current
        const power = (data.bus_voltage || 0) * Math.abs(data.ina_current_mA || 0);
        
        // Add to data storage
        this.chartData.timestamps.push(time);
        this.chartData.voltage.push(data.bus_voltage || 0);
        this.chartData.current.push(data.ina_current_mA || 0);
        this.chartData.power.push(power);
        this.chartData.temp.push(data.temp || 0);

        // Keep only last MAX_POINTS
        if (this.chartData.timestamps.length > this.MAX_POINTS) {
            Object.keys(this.chartData).forEach(key => {
                this.chartData[key].shift();
            });
        }

        // Update line charts
        const charts = [
            { id: 'voltageChart', value: data.bus_voltage || 0 },
            { id: 'currentChart', value: data.ina_current_mA || 0 },
            { id: 'powerChart', value: power },
            { id: 'tempChart', value: data.temp || 0 }
        ];

        charts.forEach(chart => {
            Plotly.extendTraces(chart.id, 
                { x: [[time]], y: [[chart.value]] }, [0]
            );
            
            // Update x-axis range for scrolling effect
            if (this.chartData.timestamps.length > 20) {
                Plotly.relayout(chart.id, {
                    'xaxis.range': [
                        this.chartData.timestamps[Math.max(0, this.chartData.timestamps.length - 20)], 
                        time
                    ]
                });
            }
        });

        // Update gauges with proper data structure
        Plotly.restyle('tempGauge', { 'value': [data.temp || 0] }, [0]);
        Plotly.restyle('powerGauge', { 'value': [power] }, [0]);
    }

    // Public method to request latest data
    requestLatestData() {
        this.socket.emit('request_latest');
    }
}

// Initialize dashboard when DOM is loaded
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new BatteryDashboard();
});

// Handle window resize for responsive charts
window.addEventListener('resize', () => {
    if (dashboard) {
        setTimeout(() => {
            Plotly.Plots.resize('voltageChart');
            Plotly.Plots.resize('currentChart');
            Plotly.Plots.resize('powerChart');
            Plotly.Plots.resize('tempChart');
            Plotly.Plots.resize('tempGauge');
            Plotly.Plots.resize('powerGauge');
        }, 100);
    }
});

// Handle orientation change on mobile
window.addEventListener('orientationchange', () => {
    if (dashboard) {
        setTimeout(() => {
            Plotly.Plots.resize('voltageChart');
            Plotly.Plots.resize('currentChart');
            Plotly.Plots.resize('powerChart');
            Plotly.Plots.resize('tempChart');
            Plotly.Plots.resize('tempGauge');
            Plotly.Plots.resize('powerGauge');
        }, 200);
    }
});
