// 数据存储
let orders = [];
let currentId = 1;

// 添加行事件监听器（双击和滑动）
function addRowEventListeners() {
    const rows = document.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const orderId = parseInt(row.getAttribute('data-order-id'));
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        
        // 双击快速打包/撤销
        row.addEventListener('dblclick', (e) => {
            // 避免在点击输入框时触发
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
            
            if (order.status === 'pending') {
                markAsPacked(orderId);
            } else {
                markAsPending(orderId);
            }
        });
        
        // 移动端滑动操作
        let touchStartX = 0;
        let touchEndX = 0;
        let rowElement = row;
        
        row.addEventListener('touchstart', (e) => {
            // 避免在点击输入框时触发
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        row.addEventListener('touchmove', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;
            
            // 显示滑动提示效果
            if (Math.abs(diff) > 10) {
                if (diff > 0) {
                    rowElement.style.transform = `translateX(${Math.min(diff, 100)}px)`;
                    rowElement.style.background = 'rgba(76, 175, 80, 0.2)';
                } else {
                    rowElement.style.transform = `translateX(${Math.max(diff, -100)}px)`;
                    rowElement.style.background = 'rgba(255, 152, 0, 0.2)';
                }
            }
        }, { passive: true });
        
        row.addEventListener('touchend', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
            
            const diff = touchEndX - touchStartX;
            
            // 重置样式
            rowElement.style.transform = '';
            rowElement.style.background = '';
            
            // 判断滑动方向和距离
            if (Math.abs(diff) > 80) { // 滑动超过80px
                if (diff > 0) {
                    // 向右滑动 - 标记为已打包
                    if (order.status === 'pending') {
                        markAsPacked(orderId);
                    }
                } else {
                    // 向左滑动 - 撤销
                    if (order.status === 'packed') {
                        markAsPending(orderId);
                    }
                }
            }
            
            touchStartX = 0;
            touchEndX = 0;
        }, { passive: true });
    });
}

// 显示Toast提示
function showToast(message) {
    // 移除已存在的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建新toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => toast.classList.add('show'), 10);
    
    // 3秒后消失
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    setupEventListeners();
    renderTable();
    updateStats();
});

// 设置事件监听器
function setupEventListeners() {
    // CSV文件导入
    document.getElementById('csvFile').addEventListener('change', handleFileUpload);
    
    // 搜索
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    // 状态筛选
    document.getElementById('statusFilter').addEventListener('change', handleFilter);
    
    // Pickup/Delivery筛选
    document.getElementById('pickupDeliveryFilter').addEventListener('change', handleFilter);
    
    // 导出
    document.getElementById('exportBtn').addEventListener('click', exportPackedOrders);
    
    // 清空数据
    document.getElementById('clearBtn').addEventListener('click', clearAllData);
}

// 处理文件上传
function handleFileUpload(event) {
    const files = event.target.files;
    if (files.length === 0) return;
    
    document.getElementById('fileCount').textContent = `已选择 ${files.length} 个文件`;
    
    let totalImported = 0;
    let processedFiles = 0;
    let errors = [];
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csv = e.target.result;
                if (!csv || csv.trim() === '') {
                    throw new Error('文件为空');
                }
                
                const data = parseCSV(csv);
                if (data.length === 0) {
                    throw new Error('没有找到有效的数据行');
                }
                
                addOrders(data);
                totalImported += data.length;
                processedFiles++;
                
                console.log(`文件 ${file.name} 导入成功:`, data.length, '条订单');
                
                // 所有文件处理完成后显示反馈
                if (processedFiles === files.length) {
                    renderTable();
                    updateStats();
                    saveToStorage();
                    
                    let message = `成功导入 ${files.length} 个文件，共 ${totalImported} 条订单！`;
                    if (errors.length > 0) {
                        message += '\n\n错误:\n' + errors.join('\n');
                    }
                    
                    setTimeout(() => {
                        alert(message);
                    }, 100);
                }
            } catch (error) {
                console.error(`文件 ${file.name} 导入失败:`, error);
                errors.push(`${file.name}: ${error.message}`);
                processedFiles++;
                
                if (processedFiles === files.length) {
                    if (totalImported > 0) {
                        renderTable();
                        updateStats();
                        saveToStorage();
                    }
                    alert(`导入完成。成功: ${totalImported} 条订单\n失败: ${errors.length} 个文件\n\n${errors.join('\n')}`);
                }
            }
        };
        
        reader.onerror = () => {
            errors.push(`${file.name}: 文件读取失败`);
            processedFiles++;
        };
        
        reader.readAsText(file, 'UTF-8');
    });
}

// 解析CSV - 新版本：保留所有原始数据，正确处理换行符
function parseCSV(csv) {
    // 使用新的解析器处理整个CSV内容
    const allRows = parseCSVContent(csv);
    
    if (allRows.length < 2) {
        console.log('CSV文件为空或只有表头');
        return [];
    }
    
    // 第一行是表头
    let headers = allRows[0];
    let startIndex = 1;
    
    // 检查第二行是否也是表头
    if (allRows.length > 1) {
        const secondRowText = allRows[1].join(' ').toLowerCase();
        // 检查是否包含表头关键词
        if (secondRowText.includes('postage') || 
            secondRowText.includes('payment proof') ||
            !allRows[1][0].match(/^\d{2}\/\d{2}\/\d{4}/)) {
            // 合并两行表头
            const secondRow = allRows[1];
            for (let i = 0; i < headers.length; i++) {
                if (!headers[i] || headers[i].trim() === '') {
                    if (secondRow[i] && secondRow[i].trim()) {
                        headers[i] = secondRow[i];
                    }
                }
            }
            startIndex = 2;
        }
    }
    
    console.log('=== CSV解析 ===');
    console.log('总行数:', allRows.length);
    console.log('表头数量:', headers.length);
    console.log('表头:', headers);
    console.log('数据行起始:', startIndex);
    
    // 解析数据行 - 保留所有列
    const dataRows = allRows.slice(startIndex);
    
    // 详细调试每一行
    console.log('\n=== 详细数据行调试 ===');
    dataRows.forEach((row, idx) => {
        console.log(`\n第 ${idx + 1} 行数据:`);
        console.log(`  - 列数: ${row.length} (表头: ${headers.length})`);
        console.log(`  - 时间戳: ${row[0]}`);
        console.log(`  - 邮箱: ${row[1]}`);
        console.log(`  - 完整数据:`, row);
        
        // 检查是否有包含换行符的字段
        row.forEach((field, fieldIdx) => {
            if (field && field.includes('\n')) {
                console.log(`  ⚠️ 第 ${fieldIdx} 列包含换行符:`, field.replace(/\n/g, '\\n'));
            }
        });
    });
    
    const data = dataRows.map((row, index) => {
        // 确保行的列数与表头一致
        while (row.length < headers.length) {
            row.push('');
        }
        
        // 创建订单对象，包含所有列的数据
        const order = {
            rowData: row, // 保存原始行数据
            headers: headers // 保存表头引用
        };
        
        return order;
    });
    
    // 保存表头到全局变量
    window.csvHeaders = headers;
    
    console.log('\n解析完成，订单数:', data.length);
    console.log('前3行数据样本:', data.slice(0, 3).map(d => d.rowData));
    
    // 验证数据完整性
    let inconsistentRows = [];
    data.forEach((order, idx) => {
        if (order.rowData.length !== headers.length) {
            inconsistentRows.push({
                row: idx + 1,
                expected: headers.length,
                actual: order.rowData.length
            });
        }
    });
    
    if (inconsistentRows.length > 0) {
        console.warn('发现列数不一致的行:', inconsistentRows);
    }
    
    return data;
}

// 旧函数（已废弃，不使用）
function identifyColumns(headers) {
    const map = {
        timestamp: 0, // 第一列通常是时间戳
        name: [],
        contact: [],
        social: [],
        email: [],
        address: [],
        items: [],
        quantity: [],
        payment: [],
        pickupDelivery: null, // pickup/delivery列
        other: []
    };
    
    headers.forEach((header, index) => {
        const headerLower = header.toLowerCase();
        
        // 跳过第一列（时间戳列）
        if (index === 0) return;
        
        // 识别pickup/delivery列
        if (headerLower.includes('pickup') && headerLower.includes('delivery')) {
            map.pickupDelivery = index;
        }
        // 识别姓名列（包括Name on Posters & Photobook等变体）
        // 注意：不排除photobook和poster，因为它们也是姓名列
        else if (headerLower.includes('name') && !headerLower.includes('proof')) {
            map.name.push(index);
        }
        // 识别联系方式列
        else if (headerLower.includes('contact') || headerLower.includes('phone') || headerLower.includes('number')) {
            map.contact.push(index);
        }
        // 识别社交媒体列
        else if (headerLower.includes('facebook') || headerLower.includes('instagram') || headerLower.includes('username') || headerLower.includes('link')) {
            map.social.push(index);
        }
        // 识别邮箱列
        else if (headerLower.includes('email')) {
            map.email.push(index);
        }
        // 识别地址列
        else if (headerLower.includes('address')) {
            map.address.push(index);
        }
        // 识别商品相关列（包括cheki、solo等，但排除空列）
        else if (!headerLower.includes('payment') && !headerLower.includes('proof') && 
                 !headerLower.includes('pickup') && !headerLower.includes('delivery') &&
                 !headerLower.includes('when') && !headerLower.includes('postage') &&
                 (headerLower.includes('cheki') || headerLower.includes('poster') || headerLower.includes('photobook') ||
                  headerLower.includes('mygo') || headerLower.includes('asuka') ||
                  headerLower.includes('solo') || headerLower.includes('ob'))) {
            map.items.push(index);
        }
        // Column列暂时先放到other中，后续会检查内容后决定
        else if (header.match(/^column/i)) {
            map.other.push(index);
        }
        // 识别数量列
        else if (headerLower.includes('quantity') || headerLower.includes('qty')) {
            map.quantity.push(index);
        }
        // 识别支付列
        else if (headerLower.includes('payment') && !headerLower.includes('proof')) {
            map.payment.push(index);
        }
        // 其他列
        else {
            map.other.push(index);
        }
    });
    
    return map;
}

// 解析订单行数据
function parseOrderRow(values, headers, columnMap) {
    // 提取时间戳
    const timestamp = values[0] || new Date().toISOString();
    
    // 先提取pickup/delivery信息，用于确定从哪个区块提取姓名
    let pickupDelivery = '';
    if (columnMap.pickupDelivery !== null && values[columnMap.pickupDelivery]) {
        pickupDelivery = values[columnMap.pickupDelivery].trim();
    }
    
    // 找到pickup/delivery列的位置，确定区块分界
    const pickupDeliveryIndex = columnMap.pickupDelivery;
    
    // 提取姓名：根据pickup/delivery类型，优先从对应区块提取
    let name = '';
    
    // 排序姓名列：优先使用"Name on Posters & Photobook"，然后是"Name :"
    const nameCols = columnMap.name.sort((a, b) => {
        const headerA = headers[a].toLowerCase();
        const headerB = headers[b].toLowerCase();
        // 优先使用"Name on Posters & Photobook"
        const aIsPoster = headerA.includes('poster') || headerA.includes('photobook');
        const bIsPoster = headerB.includes('poster') || headerB.includes('photobook');
        if (aIsPoster && !bIsPoster) return -1;
        if (!aIsPoster && bIsPoster) return 1;
        // 其次使用简单的"Name :"列
        if (headerA.includes('name :') && !headerB.includes('name :')) return -1;
        if (!headerA.includes('name :') && headerB.includes('name :')) return 1;
        return 0;
    });
    
    // 如果有pickup/delivery列且有值，根据订单类型从对应区块提取
    if (pickupDeliveryIndex !== null && pickupDelivery) {
        const pdLower = pickupDelivery.toLowerCase();
        const isPickup = pdLower.includes('pickup');
        const isDelivery = pdLower.includes('delivery');
        
        // 将姓名列分为两个区块（以pickup/delivery列为分界）
        const firstBlockNames = nameCols.filter(idx => idx < pickupDeliveryIndex);
        const secondBlockNames = nameCols.filter(idx => idx > pickupDeliveryIndex);
        
        // 根据订单类型选择对应区块
        if (isDelivery && firstBlockNames.length > 0) {
            // Delivery订单：优先从第一个区块提取（pickup/delivery列之前的区块）
            name = getFirstNonEmpty(values, firstBlockNames);
            if (!name) {
                name = getFirstNonEmpty(values, secondBlockNames);
            }
        } else if (isPickup && secondBlockNames.length > 0) {
            // Pickup订单：优先从第二个区块提取（pickup/delivery列之后的区块）
            name = getFirstNonEmpty(values, secondBlockNames);
            if (!name) {
                name = getFirstNonEmpty(values, firstBlockNames);
            }
        } else {
            // 默认：尝试所有姓名列
            name = getFirstNonEmpty(values, nameCols);
        }
    } else {
        // 没有pickup/delivery信息或列，尝试所有姓名列
        name = getFirstNonEmpty(values, nameCols);
    }
    
    // 如果还是没找到，收集所有非空的姓名列值
    if (!name || name.trim() === '') {
        const allNames = [];
        nameCols.forEach(idx => {
            if (values[idx] && values[idx].trim()) {
                const val = values[idx].trim();
                // 避免重复
                if (!allNames.includes(val)) {
                    allNames.push(val);
                }
            }
        });
        if (allNames.length > 0) {
            name = allNames.join(' / '); // 合并多个姓名
        } else {
            name = '未知客户'; // 确实没有找到任何姓名
            // 调试：如果是未知客户，输出调试信息
            console.log('未知客户调试:', {
                timestamp: values[0],
                nameCols: nameCols,
                nameValues: nameCols.map(idx => values[idx]),
                pickupDelivery: pickupDelivery
            });
        }
    }
    
    // 提取联系方式（取第一个非空的）
    const contact = getFirstNonEmpty(values, columnMap.contact) || '';
    
    // 提取社交媒体信息
    const social = getFirstNonEmpty(values, columnMap.social) || '';
    
    // 提取邮箱
    const email = getFirstNonEmpty(values, columnMap.email) || '';
    
    // 提取地址
    const address = getFirstNonEmpty(values, columnMap.address) || '';
    
    // 提取商品信息（合并所有商品相关列）
    const items = [];
    columnMap.items.forEach(index => {
        if (values[index] && values[index].trim()) {
            const header = headers[index];
            const value = values[index];
            // 对于空白值、空引号，跳过
            if (value !== '""' && value !== '"""' && value.trim() !== '') {
                items.push(`${header}: ${value}`);
            }
        }
    });
    const itemsStr = items.join(' | ') || '未指定商品';
    
    // 提取数量（取第一个非空的）
    const quantity = getFirstNonEmpty(values, columnMap.quantity) || '';
    
    // 提取支付信息
    const payment = getFirstNonEmpty(values, columnMap.payment) || '';
    
    // 合并备注信息
    const notes = [];
    if (email) notes.push(`邮箱: ${email}`);
    if (social) notes.push(`社交账号: ${social}`);
    if (address) notes.push(`地址: ${address}`);
    if (payment) notes.push(`支付: ${payment}`);
    
    // 添加其他列的信息（排除pickup/delivery和支付凭证URL）
    columnMap.other.forEach(index => {
        if (values[index] && values[index].trim()) {
            const header = headers[index];
            const value = values[index];
            // 排除支付凭证URL
            if (!value.toLowerCase().includes('drive.google.com') && 
                !value.toLowerCase().includes('open?id')) {
                notes.push(`${header}: ${value}`);
            }
        }
    });
    
    return {
        timestamp,
        name,
        contact,
        items: itemsStr,
        quantity: quantity || '1',
        notes: notes.join(' | '),
        pickupDelivery: pickupDelivery
    };
}

// 获取第一个非空值
function getFirstNonEmpty(values, indices) {
    for (const index of indices) {
        if (values[index] && values[index].trim()) {
            return values[index].trim();
        }
    }
    return '';
}

// 解析整个CSV内容（RFC 4180标准，正确处理引号内的换行符和逗号）
function parseCSVContent(csv) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    // 统一换行符为 \n
    const normalizedCsv = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    console.log('CSV内容长度:', normalizedCsv.length);
    console.log('CSV前200字符:', normalizedCsv.substring(0, 200));
    
    for (let i = 0; i < normalizedCsv.length; i++) {
        const char = normalizedCsv[i];
        const nextChar = normalizedCsv[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // 双引号转义：两个连续引号表示一个引号字符
                currentField += '"';
                i++; // 跳过下一个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 字段分隔符（仅在引号外）
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            // 行结束（仅在引号外）
            currentRow.push(currentField);
            
            // 只保存非空行
            if (currentRow.length > 0 && currentRow.some(field => field.trim() !== '')) {
                rows.push(currentRow);
            }
            
            currentRow = [];
            currentField = '';
        } else {
            // 普通字符（包括引号内的换行符）
            currentField += char;
        }
    }
    
    // 处理最后一行（如果有）
    if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.length > 0 && currentRow.some(field => field.trim() !== '')) {
            rows.push(currentRow);
        }
    }
    
    console.log('parseCSVContent 解析出', rows.length, '行');
    if (rows.length > 0) {
        console.log('第1行列数:', rows[0].length);
        if (rows.length > 1) {
            console.log('第2行列数:', rows[1].length);
        }
    }
    
    return rows;
}

// 添加订单
function addOrders(newOrders) {
    newOrders.forEach(order => {
        orders.push({
            id: currentId++,
            ...order,
            status: 'pending',
            notes: '', // 添加备注字段
            importTime: new Date().toISOString()
        });
    });
}

// 渲染表格 - 新版本：显示所有原始CSV列
function renderTable(displayOrders = orders) {
    const table = document.getElementById('ordersTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    if (displayOrders.length === 0) {
        // 显示空状态
        thead.innerHTML = `
            <tr>
                <th>序号</th>
                <th>打包状态</th>
                <th>操作</th>
            </tr>
        `;
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="3" class="empty-message">
                    暂无数据，请导入CSV文件
                </td>
            </tr>
        `;
        return;
    }
    
    // 获取表头
    const headers = window.csvHeaders || [];
    if (headers.length === 0) {
        alert('CSV表头数据丢失，请重新导入文件');
        return;
    }
    
    // 生成表头 - 操作按钮移到最左边
    let theadHTML = '<tr>';
    theadHTML += '<th class="col-id">序号</th>';
    theadHTML += '<th class="col-action">操作</th>';
    headers.forEach((header, index) => {
        theadHTML += `<th class="col-${index}">${escapeHtml(header || `列${index + 1}`)}</th>`;
    });
    theadHTML += '<th class="col-status">打包状态</th>';
    theadHTML += '<th class="col-notes">备注</th>';
    theadHTML += '</tr>';
    thead.innerHTML = theadHTML;
    
    // 生成表格内容 - 操作按钮在左边
    tbody.innerHTML = displayOrders.map(order => {
        let html = `<tr class="${order.status}" data-order-id="${order.id}">`;
        html += `<td class="col-id">${order.id}</td>`;
        
        // 操作按钮（移到第二列）
        html += `<td class="col-action">
            ${order.status === 'pending' 
                ? `<button class="btn btn-success btn-sm" onclick="markAsPacked(${order.id})">✓ 已打包</button>`
                : `<button class="btn btn-secondary btn-sm" onclick="markAsPending(${order.id})">↩ 撤销</button>`
            }
        </td>`;
        
        // 显示所有CSV列的数据
        order.rowData.forEach((value, index) => {
            const displayValue = value || '';
            // 转义HTML并保留换行符（转换为<br>）
            const escaped = escapeHtml(displayValue);
            const withBreaks = escaped.replace(/\n/g, '<br>');
            // title属性中不需要<br>，只显示原始文本
            const titleText = displayValue.substring(0, 500); // 限制tooltip长度
            html += `<td class="col-${index}" title="${escapeHtml(titleText)}">${withBreaks}</td>`;
        });
        
        // 打包状态
        html += `<td class="col-status">
            <span class="status-badge ${order.status}">
                ${order.status === 'pending' ? '待打包' : '已打包'}
            </span>
        </td>`;
        
        // 备注
        const notes = order.notes || '';
        html += `<td class="col-notes">
            <input type="text" 
                   class="notes-input" 
                   value="${escapeHtml(notes)}" 
                   placeholder="添加备注..." 
                   onchange="updateNotes(${order.id}, this.value)"
                   onclick="event.stopPropagation()">
        </td>`;
        
        html += '</tr>';
        return html;
    }).join('');
    
    // 添加双击和滑动事件监听器
    addRowEventListeners();
}

// 标记为已打包
function markAsPacked(id) {
    const order = orders.find(o => o.id === id);
    if (order) {
        order.status = 'packed';
        saveToStorage();
        renderTable();
        updateStats();
        showToast('✓ 已标记为打包');
    }
}

// 标记为待打包
function markAsPending(id) {
    const order = orders.find(o => o.id === id);
    if (order) {
        order.status = 'pending';
        saveToStorage();
        renderTable();
        updateStats();
        showToast('↩ 已撤销打包');
    }
}

// 更新订单备注
function updateNotes(id, notes) {
    const order = orders.find(o => o.id === id);
    if (order) {
        order.notes = notes;
        saveToStorage();
        if (notes.trim()) {
            showToast('📝 备注已保存');
        }
    }
}

// 搜索处理
function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const pickupDeliveryFilter = document.getElementById('pickupDeliveryFilter').value;
    
    filterAndRender(searchTerm, statusFilter, pickupDeliveryFilter);
}

// 筛选处理
function handleFilter() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const pickupDeliveryFilter = document.getElementById('pickupDeliveryFilter').value;
    
    filterAndRender(searchTerm, statusFilter, pickupDeliveryFilter);
}

// 筛选并渲染 - 新版本：在所有列中搜索
function filterAndRender(searchTerm, statusFilter, pickupDeliveryFilter) {
    let filtered = orders;
    
    // 状态筛选
    if (statusFilter !== 'all') {
        filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    // Pickup/Delivery筛选 - 在所有列中查找
    if (pickupDeliveryFilter !== 'all') {
        filtered = filtered.filter(order => {
            const rowText = order.rowData.join(' ').toLowerCase();
            if (pickupDeliveryFilter === 'pickup') {
                return rowText.includes('pickup');
            } else if (pickupDeliveryFilter === 'delivery') {
                return rowText.includes('delivery');
            }
            return true;
        });
    }
    
    // 搜索筛选 - 在所有列中搜索
    if (searchTerm) {
        filtered = filtered.filter(order => {
            // 在所有列中搜索
            const rowText = order.rowData.join(' ').toLowerCase();
            return rowText.includes(searchTerm);
        });
    }
    
    renderTable(filtered);
}

// 更新统计
function updateStats() {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const packed = orders.filter(o => o.status === 'packed').length;
    
    document.getElementById('totalOrders').textContent = total;
    document.getElementById('pendingOrders').textContent = pending;
    document.getElementById('packedOrders').textContent = packed;
}

// 导出已打包订单
function exportPackedOrders() {
    const packedOrders = orders.filter(o => o.status === 'packed');
    
    if (packedOrders.length === 0) {
        alert('没有已打包的订单');
        return;
    }
    
    const csv = generateCSV(packedOrders);
    downloadCSV(csv, `已打包订单_${formatDateForFilename(new Date())}.csv`);
}

// 生成CSV - 新版本：导出所有原始列
function generateCSV(data) {
    const headers = window.csvHeaders || [];
    if (headers.length === 0) {
        return ''; // 没有表头数据
    }
    
    // 添加序号和状态到表头
    const exportHeaders = ['序号', ...headers, '打包状态'];
    
    // 生成数据行
    const rows = data.map(order => {
        const row = [
            order.id,
            ...order.rowData,
            order.status === 'pending' ? '待打包' : '已打包'
        ];
        return row;
    });
    
    // 转换为CSV格式
    return [exportHeaders, ...rows].map(row => 
        row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');
}

// 下载CSV
function downloadCSV(csv, filename) {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// 清空所有数据
function clearAllData() {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
        orders = [];
        currentId = 1;
        localStorage.removeItem('orders');
        localStorage.removeItem('currentId');
        renderTable();
        updateStats();
        document.getElementById('fileCount').textContent = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = 'all';
        document.getElementById('pickupDeliveryFilter').value = 'all';
    }
}

// 保存到本地存储
function saveToStorage() {
    localStorage.setItem('orders', JSON.stringify(orders));
    localStorage.setItem('currentId', currentId.toString());
}

// 从本地存储加载
function loadFromStorage() {
    const savedOrders = localStorage.getItem('orders');
    const savedId = localStorage.getItem('currentId');
    
    if (savedOrders) {
        orders = JSON.parse(savedOrders);
    }
    
    if (savedId) {
        currentId = parseInt(savedId);
    }
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化日期用于文件名
function formatDateForFilename(date) {
    return date.toISOString().split('T')[0];
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 使函数在全局可用
window.markAsPacked = markAsPacked;
window.markAsPending = markAsPending;

// 显示帮助对话框
function showHelp() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'block';
}

// 关闭帮助对话框
function closeHelp() {
    const modal = document.getElementById('helpModal');
    modal.style.display = 'none';
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modal = document.getElementById('helpModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// 显示调试信息 - 新版本
function showDebugInfo() {
    let debugText = '=== 调试信息 ===\n\n';
    debugText += `总订单数: ${orders.length}\n`;
    debugText += `待打包: ${orders.filter(o => o.status === 'pending').length}\n`;
    debugText += `已打包: ${orders.filter(o => o.status === 'packed').length}\n\n`;
    
    const headers = window.csvHeaders || [];
    debugText += `CSV列数: ${headers.length}\n`;
    debugText += `CSV表头前5列:\n`;
    headers.slice(0, 5).forEach((h, i) => {
        debugText += `  ${i + 1}. ${h || '(空)'}\n`;
    });
    if (headers.length > 5) {
        debugText += `  ... 还有 ${headers.length - 5} 列\n`;
    }
    
    if (orders.length > 0) {
        debugText += '\n前2个订单数据样本:\n';
        orders.slice(0, 2).forEach((order, i) => {
            debugText += `\n【订单 ${i + 1}】ID: ${order.id}, 状态: ${order.status}\n`;
            debugText += `列数: ${order.rowData.length}\n`;
            order.rowData.slice(0, 3).forEach((value, idx) => {
                const displayValue = value ? value.replace(/\n/g, '\\n').substring(0, 40) : '(空)';
                debugText += `  [${idx}] ${headers[idx] || '未命名'}: ${displayValue}${value && value.length > 40 ? '...' : ''}\n`;
            });
            if (order.rowData.length > 3) {
                debugText += `  ... 还有 ${order.rowData.length - 3} 列\n`;
            }
        });
    }
    
    debugText += '\n\n💡 提示：按F12打开控制台查看完整解析信息';
    debugText += '\n如有问题，请截图控制台内容反馈';
    alert(debugText);
}

