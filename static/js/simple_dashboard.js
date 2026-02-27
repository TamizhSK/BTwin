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
            console.log('Received data:', data);
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
        const soc = data.soc_percent || 0;
        const soh = data.soh_percent || 100;

        document.getElementById('voltageValue').textContent = voltage.toFixed(2);
        document.getElementById('currentValue').textContent = current.toFixed(1);
        document.getElementById('powerValue').textContent = power.toFixed(1);
        document.getElementById('tempValue').textContent = temp.toFixed(1);
        document.getElementById('socValue').textContent = soc.toFixed(1);
        document.getElementById('sohValue').textContent = soh.toFixed(0);

        const now = new Date();
        document.getElementById('lastUpdate').textContent = 'LAST UPDATE: ' + now.toLocaleTimeString().toUpperCase();

        this.updateGauges(voltage, temp, soc, soh);
    }

    updateCharts(data) {
        const voltage = data.voltage || data.bus_voltage || 0;
        const current = data.current_ma || data.ina_current_mA || 0;
        const now = new Date();

        this.voltageData.push(voltage);
        this.currentData.push(current);
        this.timestamps.push(now);

        if (this.voltageData.length > this.maxDataPoints) {
            this.voltageData.shift();
            this.currentData.shift();
            this.timestamps.shift();
        }

        Plotly.extendTraces('voltageChart', {
            x: [[now]],
            y: [[voltage]]
        }, [0]);

        Plotly.extendTraces('currentChart', {
            x: [[now]],
            y: [[current]]
        }, [0]);

        if (this.voltageData.length > this.maxDataPoints) {
            const timeSpan = (this.timestamps[this.timestamps.length - 1] - this.timestamps[0]) / 1000;
            let tickformat, dtick;
            
            if (timeSpan < 60) {
                tickformat = '%H:%M:%S';
                dtick = 10000;
            } else if (timeSpan < 150) {
                tickformat = '%H:%M:%S';
                dtick = 30000;
            } else if (timeSpan < 300) {
                tickformat = '%H:%M';
                dtick = 60000;
            } else {
                tickformat = '%H:%M';
                dtick = 120000;
            }
            
            Plotly.relayout('voltageChart', {
                'xaxis.range': [this.timestamps[0], this.timestamps[this.timestamps.length - 1]],
                'xaxis.tickformat': tickformat,
                'xaxis.dtick': dtick
            });
            Plotly.relayout('currentChart', {
                'xaxis.range': [this.timestamps[0], this.timestamps[this.timestamps.length - 1]],
                'xaxis.tickformat': tickformat,
                'xaxis.dtick': dtick
            });
        }
    }

    initCharts() {
        const config = { displayModeBar: false, responsive: true };
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
                type: 'date',
                tickformat: '%H:%M:%S'
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

        Plotly.newPlot('voltageChart', [{
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#00ff00', width: 2 },
            marker: { color: '#00ff00', size: 3 }
        }], {
            ...chartLayout,
            yaxis: { ...chartLayout.yaxis, title: { text: 'Voltage (V)', font: { color: '#00ff00' } } }
        }, config);

        Plotly.newPlot('currentChart', [{
            x: [],
            y: [],
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#00ffff', width: 2 },
            marker: { color: '#00ffff', size: 3 }
        }], {
            ...chartLayout,
            yaxis: { ...chartLayout.yaxis, title: { text: 'Current (mA)', font: { color: '#00ff00' } } }
        }, config);
    }

    initGauges() {
        const gaugeConfig = { displayModeBar: false, responsive: true };
        const gaugeLayout = {
            paper_bgcolor: '#001100',
            plot_bgcolor: '#000000',
            font: { color: '#00ff00', family: 'Courier New', size: 12 },
            margin: { l: 10, r: 10, t: 30, b: 10 }
        };

        Plotly.newPlot('voltageGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 0,
            title: { text: "VOLTAGE", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ff00', size: 20 }, suffix: " V" },
            gauge: {
                axis: { range: [0, 5], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ff00", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 2.5], color: "#001100" },
                    { range: [2.5, 4], color: "#002200" },
                    { range: [4, 5], color: "#003300" }
                ],
                threshold: { line: { color: "#ff0000", width: 3 }, thickness: 0.75, value: 4.5 }
            }
        }], gaugeLayout, gaugeConfig);

        Plotly.newPlot('tempGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 0,
            title: { text: "TEMPERATURE", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#ff6600', size: 20 }, suffix: " °C" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#ff6600", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 30], color: "#001100" },
                    { range: [30, 60], color: "#002200" },
                    { range: [60, 100], color: "#330000" }
                ],
                threshold: { line: { color: "#ff0000", width: 3 }, thickness: 0.75, value: 80 }
            }
        }], gaugeLayout, gaugeConfig);

        Plotly.newPlot('socGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 0,
            title: { text: "BATTERY LEVEL", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ff00', size: 20 }, suffix: "%" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ff00", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 20], color: "#330000" },
                    { range: [20, 40], color: "#331100" },
                    { range: [40, 60], color: "#113300" },
                    { range: [60, 80], color: "#003300" },
                    { range: [80, 100], color: "#001100" }
                ],
                threshold: { line: { color: "#ff0000", width: 3 }, thickness: 0.75, value: 20 }
            }
        }], gaugeLayout, gaugeConfig);

        Plotly.newPlot('sohGauge', [{
            type: "indicator",
            mode: "gauge+number",
            value: 100,
            title: { text: "BATTERY HEALTH", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ffff', size: 20 }, suffix: "%" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ffff", thickness: 0.8 },
                bgcolor: "#000000",
                borderwidth: 2,
                bordercolor: "#003300",
                steps: [
                    { range: [0, 60], color: "#330000" },
                    { range: [60, 80], color: "#333300" },
                    { range: [80, 100], color: "#003300" }
                ],
                threshold: { line: { color: "#ffff00", width: 3 }, thickness: 0.75, value: 80 }
            }
        }], gaugeLayout, gaugeConfig);
    }

    updateGauges(voltage, temperature, soc = 0, soh = 100) {
        Plotly.restyle('voltageGauge', 'value', [voltage]);
        Plotly.restyle('tempGauge', 'value', [temperature]);
        Plotly.restyle('socGauge', 'value', [soc]);
        Plotly.restyle('sohGauge', 'value', [soh]);
        
        if (soc < 20) {
            Plotly.restyle('socGauge', { 'gauge.bar.color': '#ff0000' });
        } else if (soc < 50) {
            Plotly.restyle('socGauge', { 'gauge.bar.color': '#ffaa00' });
        } else {
            Plotly.restyle('socGauge', { 'gauge.bar.color': '#00ff00' });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SimpleDashboard();
});
