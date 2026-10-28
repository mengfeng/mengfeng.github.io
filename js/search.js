// A local search script with the help of [hexo-generator-search](https://github.com/PaicHyperionDev/hexo-generator-search)
// Copyright (C) 2015 
// Joseph Pan <http://github.com/wzpan>
// Shuhao Mao <http://github.com/maoshuhao>
// This library is free software; you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as
// published by the Free Software Foundation; either version 2.1 of the
// License, or (at your option) any later version.
// 
// This library is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Lesser General Public License for more details.
// 
// You should have received a copy of the GNU Lesser General Public
// License along with this library; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA
// 02110-1301 USA
// 

var searchFunc = function (path, searchId, contentId) {
  'use strict';

  var input = document.getElementById(searchId);
  var result = document.getElementById(contentId);
  if (!input || !result) {
    return;
  }

  var entries = [];

  function showMessage(message, canRetry) {
    result.replaceChildren();
    var messageNode = document.createElement('p');
    messageNode.className = 'search-result-empty';
    messageNode.textContent = message;
    result.appendChild(messageNode);
    if (canRetry) {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'local-search-retry';
      retry.textContent = '重试搜索';
      retry.addEventListener('click', loadIndex, { once: true });
      result.appendChild(retry);
    }
  }

  function plainText(markup) {
    return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function appendHighlighted(parent, value, keywords) {
    var lower = value.toLowerCase();
    var offset = 0;
    while (offset < value.length) {
      var next = value.length;
      var matched = '';
      keywords.forEach(function (keyword) {
        var position = lower.indexOf(keyword, offset);
        if (position >= 0 && position < next) {
          next = position;
          matched = keyword;
        }
      });
      if (next > offset) {
        parent.appendChild(document.createTextNode(value.slice(offset, next)));
      }
      if (!matched) {
        break;
      }
      var emphasis = document.createElement('em');
      emphasis.className = 'search-keyword';
      emphasis.textContent = value.slice(next, next + matched.length);
      parent.appendChild(emphasis);
      offset = next + matched.length;
    }
  }

  function safeUrl(value) {
    try {
      var url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function render() {
    var query = input.value.trim();
    result.replaceChildren();
    if (!query) {
      return;
    }
    if (query.length > 100) {
      showMessage('关键词过长，请缩短后再搜索。', false);
      return;
    }
    var keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    var list = document.createElement('ul');
    list.className = 'search-result-list';
    var count = 0;
    entries.forEach(function (entry) {
      if (count >= 30 || !keywords.every(function (keyword) {
        return entry.titleLower.includes(keyword) || entry.contentLower.includes(keyword);
      })) {
        return;
      }
      var url = safeUrl(entry.url);
      if (!url) {
        return;
      }
      var item = document.createElement('li');
      var title = document.createElement('a');
      title.className = 'search-result-title';
      title.href = url;
      appendHighlighted(title, entry.title, keywords);
      item.appendChild(title);

      var matchPosition = -1;
      keywords.forEach(function (keyword) {
        var position = entry.contentLower.indexOf(keyword);
        if (position >= 0 && (matchPosition < 0 || position < matchPosition)) {
          matchPosition = position;
        }
      });
      var start = Math.max(0, matchPosition - 24);
      var excerpt = entry.content.slice(start, start + 120);
      var summary = document.createElement('p');
      summary.className = 'search-result';
      if (start > 0) {
        summary.appendChild(document.createTextNode('…'));
      }
      appendHighlighted(summary, excerpt, keywords);
      if (start + excerpt.length < entry.content.length) {
        summary.appendChild(document.createTextNode('…'));
      }
      item.appendChild(summary);
      list.appendChild(item);
      count += 1;
    });

    if (!count) {
      showMessage('标题或文章开头没有匹配，换个关键词试试。', false);
      return;
    }
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'local-search-close';
    clear.id = 'local-search-close';
    clear.setAttribute('aria-label', '清空搜索结果');
    result.appendChild(clear);
    result.appendChild(list);
  }

  function loadIndex() {
    showMessage('正在加载搜索索引…', false);
    $.ajax({
      url: path,
      dataType: 'xml',
      success: function (xml) {
        entries = $('entry', xml).map(function () {
          var title = $('title', this).text().trim() || '未命名文章';
          var contentNode = $('content', this);
          var content = contentNode.attr('format') === 'plain'
            ? contentNode.text().replace(/\s+/g, ' ').trim()
            : plainText(contentNode.text());
          return {
            title: title,
            titleLower: title.toLowerCase(),
            content: content,
            contentLower: content.toLowerCase(),
            url: $('url', this).text().trim()
          };
        }).get();
        if (input.value.trim()) {
          render();
        } else {
          result.replaceChildren();
        }
      },
      error: function () {
        showMessage('搜索索引加载失败，请检查网络后重试。', true);
      }
    });
  }

  input.addEventListener('input', function () {
    if (entries.length) {
      render();
    }
  });
  $(document).on('click', '#local-search-close', function () {
    input.value = '';
    result.replaceChildren();
    input.focus();
  });
  loadIndex();
};
