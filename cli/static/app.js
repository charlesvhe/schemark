/* global Vue, ElementPlus, XLSX */
;(function () {
  const { createApp, ref, computed, onMounted } = Vue;

  function flattenRow(row) {
    var out = {};
    var keys = Object.keys(row);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = row[k];
      if (v === null || v === undefined) continue;
      if (Array.isArray(v)) {
        out[k] = JSON.stringify(v);
      } else if (typeof v === 'object') {
        var subKeys = Object.keys(v);
        if (subKeys.length === 0) continue;
        for (var j = 0; j < subKeys.length; j++) {
          var sk = subKeys[j];
          var sv = v[sk];
          if (sv === null || sv === undefined) continue;
          if (Array.isArray(sv) || (typeof sv === 'object' && sv !== null)) {
            out[k + '_' + sk] = JSON.stringify(sv);
          } else {
            out[k + '_' + sk] = sv;
          }
        }
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function collectColumns(rows) {
    var seen = {};
    var all = [];
    for (var i = 0; i < rows.length; i++) {
      var keys = Object.keys(rows[i]);
      for (var j = 0; j < keys.length; j++) {
        if (!seen[keys[j]]) {
          seen[keys[j]] = true;
          all.push(keys[j]);
        }
      }
    }
    return all;
  }

  function hasDataIn(rowList, col) {
    for (var i = 0; i < rowList.length; i++) {
      var v = rowList[i][col];
      if (v !== undefined && v !== null && v !== '') return true;
    }
    return false;
  }

  var app = createApp({
    setup: function () {
      var rows = ref([]);
      var allColumns = ref([]);
      var selectedColumns = ref([]);
      var hideEmptyColumns = ref(true);
      var activeFilters = ref({});
      var skipped = ref([]);
      var loading = ref(true);
      var showSkipped = ref(false);

      var filteredRows = computed(function () {
        var filters = activeFilters.value;
        var keys = Object.keys(filters).filter(function (k) { return filters[k] && filters[k].length > 0; });
        if (keys.length === 0) return rows.value;
        return rows.value.filter(function (row) {
          for (var i = 0; i < keys.length; i++) {
            var col = keys[i];
            var allowed = filters[col];
            var v = row[col];
            var s = v == null ? '' : String(v);
            if (allowed.indexOf(s) === -1) return false;
          }
          return true;
        });
      });

      var visibleColumns = computed(function () {
        if (!hideEmptyColumns.value) return selectedColumns.value;
        var dataset = filteredRows.value;
        return selectedColumns.value.filter(function (col) { return hasDataIn(dataset, col); });
      });

      onMounted(function () {
        fetch('/api/meta')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var flat = data.files.map(flattenRow);
            rows.value = flat;
            var cols = collectColumns(flat);
            allColumns.value = cols;
            selectedColumns.value = cols.slice();
            skipped.value = data.skipped || [];
            loading.value = false;
          })
          .catch(function (err) {
            ElementPlus.ElMessage.error('加载失败: ' + err.message);
            loading.value = false;
          });
      });

      function openFile(path) {
        fetch('/api/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: path })
        }).then(function (r) {
          return r.json().then(function (body) { return { ok: r.ok, body: body }; });
        }).then(function (res) {
          if (res.ok) {
            ElementPlus.ElMessage.success('已打开: ' + path);
          } else {
            ElementPlus.ElMessage.error(res.body.error || '打开失败');
          }
        }).catch(function (err) {
          ElementPlus.ElMessage.error('请求失败: ' + err.message);
        });
      }

      function filtersFor(col) {
        var seen = {};
        var arr = [];
        for (var i = 0; i < rows.value.length; i++) {
          var v = rows.value[i][col];
          if (v === undefined || v === null || v === '') continue;
          var s = String(v);
          if (!seen[s]) {
            seen[s] = true;
            arr.push({ text: s, value: s });
          }
        }
        arr.sort(function (a, b) { return a.text < b.text ? -1 : a.text > b.text ? 1 : 0; });
        return arr;
      }

      function onFilterChange(payload) {
        var next = Object.assign({}, activeFilters.value);
        var k = Object.keys(payload);
        for (var i = 0; i < k.length; i++) {
          next[k[i]] = payload[k[i]];
        }
        activeFilters.value = next;
      }

      function exportExcel() {
        if (typeof XLSX === 'undefined') {
          ElementPlus.ElMessage.error('XLSX 库未加载');
          return;
        }
        var cols = visibleColumns.value;
        if (cols.length === 0) {
          ElementPlus.ElMessage.warning('当前没有可导出的列');
          return;
        }
        var data = filteredRows.value;
        if (data.length === 0) {
          ElementPlus.ElMessage.warning('当前没有可导出的行');
          return;
        }
        var aoa = [cols.slice()];
        for (var i = 0; i < data.length; i++) {
          var r = data[i];
          var line = [];
          for (var j = 0; j < cols.length; j++) {
            var v = r[cols[j]];
            line.push(v === undefined || v === null ? '' : v);
          }
          aoa.push(line);
        }
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'meta');
        var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        XLSX.writeFile(wb, 'schemark-meta-' + ts + '.xlsx');
        ElementPlus.ElMessage.success('已导出 ' + data.length + ' 行 / ' + cols.length + ' 列');
      }

      return {
        rows: rows,
        filteredRows: filteredRows,
        allColumns: allColumns,
        selectedColumns: selectedColumns,
        visibleColumns: visibleColumns,
        hideEmptyColumns: hideEmptyColumns,
        skipped: skipped,
        loading: loading,
        showSkipped: showSkipped,
        openFile: openFile,
        filtersFor: filtersFor,
        onFilterChange: onFilterChange,
        exportExcel: exportExcel
      };
    },
    template: '\
<div>\
  <div v-if="skipped.length > 0" class="skipped-panel">\
    <el-alert type="warning" :closable="false" show-icon>\
      <template #title>\
        <span>有 {{ skipped.length }} 个文件解析失败</span>\
        <el-button type="primary" link size="small" @click="showSkipped = !showSkipped" style="margin-left:8px">\
          {{ showSkipped ? "收起" : "展开" }}\
        </el-button>\
      </template>\
    </el-alert>\
    <el-table v-if="showSkipped" :data="skipped" size="small" style="margin-top:8px" border>\
      <el-table-column prop="path" label="path" />\
      <el-table-column prop="type" label="type" width="200" />\
      <el-table-column prop="message" label="message" />\
    </el-table>\
  </div>\
  <div class="header">\
    <h1>Schemark Meta</h1>\
    <el-select v-model="selectedColumns" multiple collapse-tags collapse-tags-tooltip\
      placeholder="选择展示列" class="column-select" filterable>\
      <el-option v-for="col in allColumns" :key="col" :label="col" :value="col" />\
    </el-select>\
    <el-checkbox v-model="hideEmptyColumns">隐藏无数据的列</el-checkbox>\
    <el-button type="primary" @click="exportExcel">导出 Excel</el-button>\
  </div>\
  <div class="table-wrap">\
    <el-table :data="filteredRows" v-loading="loading" border stripe height="100%" style="width:100%"\
      @filter-change="onFilterChange">\
      <el-table-column v-for="col in visibleColumns" :key="col" :prop="col" :column-key="col" :label="col"\
        :min-width="col === \'path\' ? 280 : 140" show-overflow-tooltip sortable\
        :filters="filtersFor(col)">\
        <template #default="{ row }" v-if="col === \'path\'">\
          <a class="cell-link" @click.prevent="openFile(row.path)">{{ row.path }}</a>\
        </template>\
      </el-table-column>\
    </el-table>\
  </div>\
</div>'
  });

  app.use(ElementPlus);
  app.mount('#app');
})();
