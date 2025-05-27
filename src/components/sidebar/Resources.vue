<!-- <template>
  <div class="resources">
    <div class="resource-section">
      <h4>能源供应</h4>
      <div class="resource-progress">
        <div class="progress-label">
          <span>电力</span>
          <span>750 MW / 1000 MW</span>
        </div>
        <div class="progress-bar">
          <div class="progress" style="width: 75%"></div>
        </div>
      </div>
      <div class="resource-progress">
        <div class="progress-label">
          <span>水资源</span>
          <span>450 K㎥ / 600 K㎥</span>
        </div>
        <div class="progress-bar">
          <div class="progress" style="width: 75%"></div>
        </div>
      </div>
    </div>
    
    <div class="resource-section">
      <h4>服务设施</h4>
      <div class="facility-grid">
        <div class="facility-item">
          <div class="facility-icon">🏥</div>
          <div class="facility-details">
            <div class="facility-name">医疗</div>
            <div class="facility-status good">优</div>
          </div>
        </div>
        <div class="facility-item">
          <div class="facility-icon">🏫</div>
          <div class="facility-details">
            <div class="facility-name">教育</div>
            <div class="facility-status good">优</div>
          </div>
        </div>
        <div class="facility-item">
          <div class="facility-icon">👮</div>
          <div class="facility-details">
            <div class="facility-name">安全</div>
            <div class="facility-status normal">良</div>
          </div>
        </div>
        <div class="facility-item">
          <div class="facility-icon">🚒</div>
          <div class="facility-details">
            <div class="facility-name">消防</div>
            <div class="facility-status normal">良</div>
          </div>
        </div>
        <div class="facility-item">
          <div class="facility-icon">🏢</div>
          <div class="facility-details">
            <div class="facility-name">办公</div>
            <div class="facility-status warning">中</div>
          </div>
        </div>
        <div class="facility-item">
          <div class="facility-icon">🛒</div>
          <div class="facility-details">
            <div class="facility-name">商业</div>
            <div class="facility-status warning">中</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="resource-section">
      <h4>资源消耗</h4>
      <div class="consumption-item">
        <span class="label">电力消耗:</span>
        <span class="value increasing">↗️ 25 MW/h</span>
      </div>
      <div class="consumption-item">
        <span class="label">水资源消耗:</span>
        <span class="value stable">→ 12 K㎥/h</span>
      </div>
      <div class="consumption-item">
        <span class="label">垃圾产出:</span>
        <span class="value decreasing">↘️ 8 ton/h</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.resources {
  color: var(--cl-text);
}

.resource-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  h4 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--cl-primary);
  }
}

.resource-progress {
  margin-bottom: 15px;
  
  .progress-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 5px;
  }
  
  .progress-bar {
    height: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    overflow: hidden;
    
    .progress {
      height: 100%;
      background: var(--cl-primary);
    }
  }
}

.facility-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.facility-item {
  display: flex;
  align-items: center;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  
  .facility-icon {
    font-size: 24px;
    margin-right: 10px;
  }
  
  .facility-details {
    flex: 1;
    
    .facility-name {
      font-size: 14px;
      margin-bottom: 4px;
    }
    
    .facility-status {
      font-size: 12px;
      font-weight: bold;
      
      &.good {
        color: #2ecc71;
      }
      
      &.normal {
        color: #3498db;
      }
      
      &.warning {
        color: #f39c12;
      }
      
      &.bad {
        color: #e74c3c;
      }
    }
  }
}

.consumption-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  
  .label {
    color: rgba(255, 255, 255, 0.7);
  }
  
  .value {
    font-weight: bold;
    
    &.increasing {
      color: #e74c3c;
    }
    
    &.decreasing {
      color: #2ecc71;
    }
    
    &.stable {
      color: #3498db;
    }
  }
}
</style> -->
