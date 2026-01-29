class SimpleDashboard {
    constructor() {
        this.socket = io();
        this.voltageData = [];
        this.currentData = [];
        this.timestamps = [];
        this.maxDataPoints = 50;
        this.init();
    }

    init() {
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });

        this.socket.on('new_data', (data) => {
            console.log('Received data:', data); // Debug log
            this.updateMetrics(data);
            this.updateCharts(data);
        });

        this.initCharts();
        this.initGauges();
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (connected) {
            statusEl.textContent = '● CONNECTED';
            statusEl.className = 'status-connected';
        } else {
            statusEl.textContent = '● DISCONNECTED';
            statusEl.className = 'status-disconnected';
        }
    }

    updateMetrics(data) {
        const voltage = data.voltage || data.bus_voltage || 0;
        const current = data.current_ma || data.ina_current_mA || 0;
        const power = data.power_mw || (voltage * current) || 0;
        const temp = data.temperature || data.temp || 0;

        document.getElementById('voltageValue').textContent = voltage.toFixed(2);
        document.getElementById('currentValue').textContent = current.toFixed(1);
        document.getElementById('powerValue').textContent = power.toFixed(1);
        document.getElementById('tempValue').textContent = temp.toFixed(1);

        const now = new Date();
        document.getElementById('lastUpdate').textContent = 'LAST UPDATE: ' + now.toLocaleTimeString().toUpperCase();

        // Update gauges
        this.updateGauges(voltage, temp);
    }

    updateCharts(data) {
        const voltage = data.voltage || data.bus_voltage || 0;
        const current = data.current_ma || data.ina_current_mA || 0;
        const now = new Date();

        console.log('Updating charts with:', voltage, current); // Debug log

        // Add new data
        this.voltageData.push(voltage);
        this.currentData.push(current);
        this.timestamps.push(now);

        // Keep only last N points
        if (this.voltageData.length > this.maxDataPoints) {
            this.voltageData.shift();
            this.currentData.shift();
            this.timestamps.shift();
        }

        // Update voltage chart using extendTraces for real-time updates
        Plotly.extendTraces('voltageChart', {
            x: [[now]],
            y: [[voltage]]
        }, [0]);

        // Update current chart
        Plotly.extendTraces('currentChart', {
            x: [[now]],
            y: [[current]]
        }, [0]);

        // Remove old points if we have too many
        if (this.voltageData.length > this.maxDataPoints) {
            Plotly.relayout('voltageChart', {
                'xaxis.range': [this.timestamps[0], this.timestamps[this.timestamps.length - 1]]
            });
            Plotly.relayout('currentChart', {
                'xaxis.range': [this.timestamps[0], this.timestamps[this.timestamps.length - 1]]
            });
        }
    }

    initCharts() {
        const config = { 
            displayModeBar: false, 
            responsive: true
        };

        const chartLayout = {
            paper_bgcolor: '#001100',
            plot_bgcolor: '#000000',
            font: { color: '#00ff00', family: 'Courier New', size: 10 },
            xaxis: { 
                gridcolor: '#003300',
                tickcolor: '#00ff00',
                linecolor: '#00ff00',
                showgrid: true,
                zeroline: false,
                type: 'date'
            },
            yaxis: { 
                gridcolor: '#003300',
                tickcolor: '#00ff00',
                linecolor: '#00ff00',
                showgrid: true,
                zeroline: false
            },
            margin: { l: 60, r: 20, t: 20, b: 50 },
            showlegend: false
        };

        // Initialize voltage chart
        Plotly.newPlot('voltageChart', [{
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#00ff00', width: 2 },
            marker: { color: '#00ff00', size: 3 },
            name: 'Voltage'
        }], {
            ...chartLayout,
            yaxis: { ...chartLayout.yaxis, title: { text: 'Voltage (V)', font: { color: '#00ff00' } } }
        }, config);

        // Initialize current chart
        Plotly.newPlot('currentChart', [{
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#00ffff', width: 2 },
            marker: { color: '#00ffff', size: 3 },
            name: 'Current'
        }], {
            ...chartLayout,
            yaxis: { ...chartLayout.yaxis, title: { text: 'Current (mA)', font: { color: '#00ff00' } } }
        }, config);
    }

    initGauges() {
        const gaugeConfig = { 
            displayModeBar: false, 
            responsive: true
        };

        const gaugeLayout = {
            paper_bgcolor: '#001100',
            plot_bgcolor: '#000000',
            font: { color: '#00ff00', family: 'Courier New', size: 12 },
            margin: { l: 10, r: 10, t: 30, b: 10 }
        };

        // Voltage gauge
        Plotly.newPlot('voltageGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 0,
            domain: { x: [0, 1], y: [0, 1] },
            title: { 
                text: "VOLTAGE", 
                font: { color: '#00ff00', size: 14 } 
            },
            number: { 
                font: { color: '#00ff00', size: 20 },
                suffix: " V"
            },
            gauge: {
                axis: { 
                    range: [null, 5], 
                    tickcolor: '#00ff00',
                    tickfont: { color: '#00ff00', size: 10 }
                },
                bar: { color: "#00ff00", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 2.5], color: "#001100" },
                    { range: [2.5, 4], color: "#002200" },
                    { range: [4, 5], color: "#003300" }
                ],
                threshold: {
                    line: { color: "#ff0000", width: 3 },
                    thickness: 0.75,
                    value: 4.5
                }
            }
        }], gaugeLayout, gaugeConfig);

        // Temperature gauge
        Plotly.newPlot('tempGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 0,
            domain: { x: [0, 1], y: [0, 1] },
            title: { 
                text: "TEMPERATURE", 
                font: { color: '#00ff00', size: 14 } 
            },
            number: { 
                font: { color: '#ff6600', size: 20 },
                suffix: " °C"
            },
            gauge: {
                axis: { 
                    range: [null, 100], 
                    tickcolor: '#00ff00',
                    tickfont: { color: '#00ff00', size: 10 }
                },
                bar: { color: "#ff6600", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 30], color: "#001100" },
                    { range: [30, 60], color: "#002200" },
                    { range: [60, 100], color: "#330000" }
                ],
                threshold: {
                    line: { color: "#ff0000", width: 3 },
                    thickness: 0.75,
                    value: 80
                }
            }
        }], gaugeLayout, gaugeConfig);
    }

    updateGauges(voltage, temperature) {
        // Update voltage gauge
        Plotly.restyle('voltageGauge', 'value', [voltage]);
        
        // Update temperature gauge
        Plotly.restyle('tempGauge', 'value', [temperature]);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SimpleDashboard();
});
