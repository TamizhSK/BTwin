class SimpleDashboard {
    constructor() {
        this.socket = io();
        this.voltageData = [];
        this.vPredData = [];
        this.socEsp32Data = [];
        this.socEkfData = [];
        this.timestamps = [];
        this.maxDataPoints = 50;
        this.ocvChartReady = false;
        this.dfnReady = false;
        this.init();
    }

    init() {
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
            // Request DFN status on connect
            this.socket.emit('request_dfn_status');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });

        this.socket.on('new_data', (data) => {
            this.updateMetrics(data);
            this.updateDFNPanel(data);
            this.updateCharts(data);
        });

        this.socket.on('dfn_status', (status) => {
            this.updateDFNBanner(status);
            if (status.is_ready && !this.ocvChartReady) {
                this.loadOCVChart();
            }
        });

        this.initCharts();
        this.initGauges();

        // Poll DFN status every 5s until ready
        this._dfnPollInterval = setInterval(() => {
            if (!this.dfnReady) {
                fetch('/api/dfn_status')
                    .then(r => r.json())
                    .then(s => {
                        this.updateDFNBanner(s);
                        if (s.is_ready) {
                            if (!this.ocvChartReady) this.loadOCVChart();
                            clearInterval(this._dfnPollInterval);
                        }
                    })
                    .catch(() => {});
            }
        }, 5000);
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

    updateDFNBanner(status) {
        const indicator = document.getElementById('dfnIndicator');
        const meta = document.getElementById('dfnMeta');
        const paramInfo = document.getElementById('dfnParamInfo');
        const banner = document.getElementById('dfnBanner');

        const ver = status.pybamm_version ? `v${status.pybamm_version}` : '';
        paramInfo.textContent = `PyBaMM ${ver} / ${status.parameter_set || 'Chen2020'}`;

        if (status.is_ready) {
            this.dfnReady = true;
            indicator.textContent = '● READY';
            indicator.className = 'dfn-indicator dfn-ready';
            const pts = status.ocv_points || 0;
            const r0 = status.ecm_R0 ? (status.ecm_R0 * 1000).toFixed(1) : '--';
            meta.textContent = `OCV: ${pts} pts | R0=${r0}mΩ | ${status.parameter_set_info || ''}`;
            banner.className = 'dfn-banner dfn-banner-ready';
        } else if (status.status && status.status.startsWith('error')) {
            indicator.textContent = '● ERROR';
            indicator.className = 'dfn-indicator dfn-error';
            meta.textContent = status.error || 'DFN init failed — using fallback OCV';
            banner.className = 'dfn-banner dfn-banner-error';
        } else {
            indicator.textContent = '● INITIALIZING';
            indicator.className = 'dfn-indicator dfn-init';
            meta.textContent = `Status: ${status.status || 'loading'} — OCV table generation in progress...`;
            banner.className = 'dfn-banner dfn-banner-init';
        }
    }

    updateDFNPanel(data) {
        const set = (id, val, decimals = 3) => {
            const el = document.getElementById(id);
            if (el) el.textContent = (val != null && val !== undefined && val !== '') ? Number(val).toFixed(decimals) : '--';
        };

        set('ocvValue', data.ocv, 3);
        set('vPredValue', data.v_predicted, 3);
        set('innovValue', data.innovation != null ? data.innovation * 1000 : null, 1);
        set('r0Value', data.r0 != null ? data.r0 * 1000 : null, 1);
        set('sigmaValue', data.sigma_soc != null ? data.sigma_soc * 100 : null, 2);
        set('cyclesValue', data.full_cycles, 3);
        set('sohCapValue', data.soh_capacity, 1);
        set('sohResValue', data.soh_resistance, 1);
    }

    updateMetrics(data) {
        const voltage = data.voltage || data.bus_voltage || 0;
        const current = data.current_ma || data.ina_current_mA || 0;
        const power = data.power_mw || (voltage * current) || 0;
        const temp = data.temperature || data.temp || 0;
        const soc = data.soc_percent || 0;
        const socEkf = data.soc_ekf != null ? data.soc_ekf : null;
        const soh = data.soh_percent || 100;
        const rul = data.rul_days;

        document.getElementById('voltageValue').textContent = voltage.toFixed(2);
        document.getElementById('currentValue').textContent = current.toFixed(1);
        document.getElementById('powerValue').textContent = power.toFixed(1);
        document.getElementById('tempValue').textContent = temp.toFixed(1);
        document.getElementById('socValue').textContent = soc.toFixed(1);
        document.getElementById('socEkfValue').textContent = socEkf != null ? socEkf.toFixed(1) : '--';
        document.getElementById('sohValue').textContent = soh.toFixed(0);
        document.getElementById('rulValue').textContent = rul != null ? rul.toFixed(0) : '--';

        const now = new Date();
        document.getElementById('lastUpdate').textContent = 'LAST UPDATE: ' + now.toLocaleTimeString().toUpperCase();

        const displaySoc = socEkf != null ? socEkf : soc;
        this.updateGauges(voltage, temp, displaySoc, soh);
    }

    updateCharts(data) {
        const voltage = data.voltage || data.bus_voltage || 0;
        const vPred = data.v_predicted || voltage;
        const soc = data.soc_percent || 0;
        const socEkf = data.soc_ekf != null ? data.soc_ekf : soc;
        const now = new Date();

        this.voltageData.push(voltage);
        this.vPredData.push(vPred);
        this.socEsp32Data.push(soc);
        this.socEkfData.push(socEkf);
        this.timestamps.push(now);

        const trim = () => {
            while (this.timestamps.length > this.maxDataPoints) {
                this.voltageData.shift();
                this.vPredData.shift();
                this.socEsp32Data.shift();
                this.socEkfData.shift();
                this.timestamps.shift();
            }
        };
        trim();

        // Voltage chart: measured + DFN predicted
        Plotly.extendTraces('voltageChart', {
            x: [[now], [now]],
            y: [[voltage], [vPred]]
        }, [0, 1]);

        // SOC comparison chart
        Plotly.extendTraces('socChart', {
            x: [[now], [now]],
            y: [[soc], [socEkf]]
        }, [0, 1]);

        if (this.timestamps.length >= this.maxDataPoints) {
            const t0 = this.timestamps[0];
            const t1 = this.timestamps[this.timestamps.length - 1];
            const span = (t1 - t0) / 1000;
            const fmt = span < 180 ? '%H:%M:%S' : '%H:%M';
            const dtick = span < 60 ? 10000 : span < 180 ? 30000 : 60000;
            ['voltageChart', 'socChart'].forEach(id => {
                Plotly.relayout(id, {
                    'xaxis.range': [t0, t1],
                    'xaxis.tickformat': fmt,
                    'xaxis.dtick': dtick
                });
            });
        }
    }

    loadOCVChart() {
        fetch('/api/dfn_ocv_table')
            .then(r => r.json())
            .then(d => {
                if (!d.ready || !d.soc || !d.soc.length) return;
                const soc_pct = d.soc.map(s => s * 100);
                Plotly.react('ocvChart', [{
                    x: soc_pct,
                    y: d.ocv,
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: '#00ffff', width: 2 },
                    name: 'DFN OCV (Chen2020)'
                }], {
                    paper_bgcolor: '#001100',
                    plot_bgcolor: '#000000',
                    font: { color: '#00ff00', family: 'Courier New', size: 10 },
                    xaxis: {
                        title: { text: 'State of Charge (%)', font: { color: '#00ff00' } },
                        gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00',
                        range: [0, 100]
                    },
                    yaxis: {
                        title: { text: 'Open Circuit Voltage (V)', font: { color: '#00ff00' } },
                        gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00'
                    },
                    margin: { l: 60, r: 20, t: 20, b: 50 },
                    showlegend: false,
                    annotations: [{
                        x: 50, y: d.ocv[Math.floor(d.ocv.length / 2)],
                        text: 'DFN SPM C/20 quasi-static | PyBaMM Chen2020',
                        showarrow: false,
                        font: { color: '#00aa00', size: 9 }
                    }]
                }, { displayModeBar: false, responsive: true });
                this.ocvChartReady = true;
            })
            .catch(err => console.warn('OCV chart load failed:', err));
    }

    initCharts() {
        const config = { displayModeBar: false, responsive: true };
        const baseLayout = {
            paper_bgcolor: '#001100',
            plot_bgcolor: '#000000',
            font: { color: '#00ff00', family: 'Courier New', size: 10 },
            xaxis: {
                gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00',
                showgrid: true, zeroline: false, type: 'date', tickformat: '%H:%M:%S'
            },
            yaxis: {
                gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00',
                showgrid: true, zeroline: false
            },
            margin: { l: 60, r: 20, t: 20, b: 50 },
            legend: { font: { color: '#00ff00', size: 9 }, bgcolor: '#001100' }
        };

        // Voltage chart: measured (green) + DFN predicted (cyan)
        Plotly.newPlot('voltageChart', [
            {
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#00ff00', width: 2 }, name: 'Measured'
            },
            {
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#00ffff', width: 1.5, dash: 'dot' }, name: 'DFN Predicted'
            }
        ], {
            ...baseLayout,
            yaxis: { ...baseLayout.yaxis, title: { text: 'Voltage (V)', font: { color: '#00ff00' } } },
            showlegend: true
        }, config);

        // SOC comparison chart
        Plotly.newPlot('socChart', [
            {
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#ffaa00', width: 2 }, name: 'ESP32 SOC'
            },
            {
                x: [], y: [], type: 'scatter', mode: 'lines',
                line: { color: '#00ffff', width: 2 }, name: 'EKF/DFN SOC'
            }
        ], {
            ...baseLayout,
            yaxis: { ...baseLayout.yaxis, title: { text: 'SOC (%)', font: { color: '#00ff00' } }, range: [0, 105] },
            showlegend: true
        }, config);

        // OCV chart placeholder
        Plotly.newPlot('ocvChart', [{
            x: [], y: [], type: 'scatter', mode: 'lines',
            line: { color: '#00ffff', width: 2 }
        }], {
            paper_bgcolor: '#001100',
            plot_bgcolor: '#000000',
            font: { color: '#00ff00', family: 'Courier New', size: 10 },
            xaxis: {
                title: { text: 'State of Charge (%)', font: { color: '#00ff00' } },
                gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00'
            },
            yaxis: {
                title: { text: 'OCV (V)', font: { color: '#00ff00' } },
                gridcolor: '#003300', tickcolor: '#00ff00', linecolor: '#00ff00'
            },
            margin: { l: 60, r: 20, t: 20, b: 50 },
            annotations: [{
                x: 0.5, y: 0.5, xref: 'paper', yref: 'paper',
                text: 'DFN INITIALIZING — OCV TABLE LOADING...',
                showarrow: false, font: { color: '#005500', size: 12 }
            }]
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
            type: "indicator", mode: "gauge+number", value: 0,
            title: { text: "VOLTAGE", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ff00', size: 20 }, suffix: " V" },
            gauge: {
                axis: { range: [0, 5], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ff00", thickness: 0.8 },
                bgcolor: "#000000", borderwidth: 2, bordercolor: "#003300",
                steps: [
                    { range: [0, 2.5], color: "#001100" },
                    { range: [2.5, 4], color: "#002200" },
                    { range: [4, 5], color: "#003300" }
                ],
                threshold: { line: { color: "#ff0000", width: 3 }, thickness: 0.75, value: 4.5 }
            }
        }], gaugeLayout, gaugeConfig);

        Plotly.newPlot('tempGauge', [{
            type: "indicator", mode: "gauge+number", value: 0,
            title: { text: "TEMPERATURE", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#ff6600', size: 20 }, suffix: " °C" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#ff6600", thickness: 0.8 },
                bgcolor: "#000000", borderwidth: 2, bordercolor: "#003300",
                steps: [
                    { range: [0, 30], color: "#001100" },
                    { range: [30, 60], color: "#002200" },
                    { range: [60, 100], color: "#330000" }
                ],
                threshold: { line: { color: "#ff0000", width: 3 }, thickness: 0.75, value: 80 }
            }
        }], gaugeLayout, gaugeConfig);

        Plotly.newPlot('socGauge', [{
            type: "indicator", mode: "gauge+number", value: 0,
            title: { text: "SOC — EKF/DFN", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ff00', size: 20 }, suffix: "%" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ff00", thickness: 0.8 },
                bgcolor: "#000000", borderwidth: 2, bordercolor: "#003300",
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
            type: "indicator", mode: "gauge+number", value: 100,
            title: { text: "BATTERY HEALTH", font: { color: '#00ff00', size: 14 } },
            number: { font: { color: '#00ffff', size: 20 }, suffix: "%" },
            gauge: {
                axis: { range: [0, 100], tickcolor: '#00ff00', tickfont: { color: '#00ff00', size: 10 } },
                bar: { color: "#00ffff", thickness: 0.8 },
                bgcolor: "#000000", borderwidth: 2, bordercolor: "#003300",
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
