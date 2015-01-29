/*
 * Token.cpp
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

#include <core/libclang/Token.hpp>

#include <core/libclang/LibClang.hpp>

namespace rstudio {
namespace core {
namespace libclang {

CXTokenKind Token::kind() const
{
   return libclang::clang().getTokenKind(token_);
}

std::string Token::spelling() const
{
   return toStdString(libclang::clang().getTokenSpelling(
                         tu_.getCXTranslationUnit(), token_));
}

SourceLocation Token::location() const
{
   return SourceLocation(libclang::clang().getTokenLocation(
                         tu_.getCXTranslationUnit(), token_));
}

SourceRange Token::extent() const
{
   return SourceRange(libclang::clang().getTokenExtent(
                         tu_.getCXTranslationUnit(), token_));
}

Tokens::Tokens(TranslationUnit tu, const SourceRange &sourceRange)
   : tu_(tu), pTokens_(NULL), numTokens_(0)
{
   libclang::clang().tokenize(tu_.getCXTranslationUnit(),
                              sourceRange.getCXSourceRange(),
                              &pTokens_,
                              &numTokens_);
}

Tokens::~Tokens()
{
   try
   {
      if (pTokens_ != NULL)
      {
        libclang::clang().disposeTokens(tu_.getCXTranslationUnit(),
                                        pTokens_,
                                        numTokens_);
      }
   }
   catch(...)
   {
   }
}

} // namespace libclang
} // namespace core
} // namespace rstudio

