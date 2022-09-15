/*
 * WorkbenchMetricsChangedEvent.java
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client.workbench.events;

import com.google.gwt.event.shared.EventHandler;
import com.google.gwt.event.shared.GwtEvent;
import org.rstudio.studio.client.workbench.model.WorkbenchMetrics;

public class WorkbenchMetricsChangedEvent extends GwtEvent<WorkbenchMetricsChangedEvent.Handler>
{
   public static final GwtEvent.Type<Handler> TYPE = new GwtEvent.Type<>();

   public interface Handler extends EventHandler
   {
      void onWorkbenchMetricsChanged(WorkbenchMetricsChangedEvent event);
   }

   public WorkbenchMetricsChangedEvent(WorkbenchMetrics clientMetrics)
   {
      clientMetrics_ = clientMetrics;
   }

   public WorkbenchMetrics getWorkbenchMetrics()
   {
      return clientMetrics_;
   }

   @Override
   protected void dispatch(Handler handler)
   {
      handler.onWorkbenchMetricsChanged(this);
   }

   @Override
   public GwtEvent.Type<Handler> getAssociatedType()
   {
      return TYPE;
   }

   private final WorkbenchMetrics clientMetrics_;
}
