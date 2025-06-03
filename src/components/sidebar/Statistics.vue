<!-- <template>
  <div class="statistics">
    <div class="chart-container">
      <h4>人口统计</h4>
      <div class="chart-placeholder">
        <div class="bar" v-for="i in 5" :key="i" :style="{height: `${20 + Math.random() * 50}px`}"></div>
      </div>
    </div>
    
    <div class="chart-container">
      <h4>资源消耗</h4>
      <div class="chart-placeholder circle-chart">
        <div class="circle-item">
          <div class="circle" style="background: conic-gradient(var(--cl-primary) 70%, transparent 0);">
            <span>70%</span>
          </div>
          <div class="label">电力</div>
        </div>
        <div class="circle-item">
          <div class="circle" style="background: conic-gradient(var(--cl-primary) 45%, transparent 0);">
            <span>45%</span>
          </div>
          <div class="label">水资源</div>
        </div>
        <div class="circle-item">
          <div class="circle" style="background: conic-gradient(var(--cl-primary) 85%, transparent 0);">
            <span>85%</span>
          </div>
          <div class="label">垃圾处理</div>
        </div>
      </div>
    </div>
    
    <div class="chart-container">
      <h4>交通流量</h4>
      <div class="chart-placeholder line-chart">
        <svg viewBox="0 0 200 60" width="100%" height="60">
          <polyline
            fill="none"
            stroke="var(--cl-primary)"
            stroke-width="2"
            points="0,40 20,30 40,35 60,15 80,20 100,25 120,10 140,30 160,20 180,25 200,15"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.statistics {
  color: var(--cl-text);
}

.chart-container {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--cl-primary);
  }
}

.chart-placeholder {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  padding: 10px;
  height: 100px;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  
  .bar {
    width: 15%;
    background: var(--cl-primary);
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
  }
  
  &.circle-chart {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 120px;
    
    .circle-item {
      text-align: center;
      
      .circle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        color: white;
        font-weight: bold;
        
        &::before {
          content: '';
          position: absolute;
          width: 50px;
          height: 50px;
          background: var(--cl-panel-bg);
          border-radius: 50%;
        }
        
        span {
          position: relative;
          z-index: 1;
        }
      }
      
      .label {
        margin-top: 5px;
        font-size: 12px;
      }
    }
  }
  
  &.line-chart {
    height: 80px;
    padding: 10px;
  }
}
</style> -->
